/**
 * Pilot MCP Server
 *
 * An AI agent that handles messages via the MCP Mesh event bus.
 *
 * Architecture:
 * - Fast Router: Inline LLM prompt that decides how to handle each message
 * - Threads: File-based JSON conversation tracking (./data/threads/)
 * - Event-driven: Subscribes to user.message.received, publishes responses
 *
 * The fast router is embedded in TypeScript for speed and simplicity.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

// Workflow Storage (via MCP Studio - for workflow tools, not message handling)
import {
  loadWorkflow,
  listWorkflows,
  saveWorkflow,
  duplicateWorkflow,
  hasStudioClient,
  setWorkflowStudioClient,
} from "./core/workflow-studio-adapter.ts";

// Execution Tracking (for workflow tools, not message handling)
import {
  initExecutionAdapter,
  getExecution,
  listExecutions,
} from "./core/execution-adapter.ts";

// Thread Management (file-based JSON)
import {
  getOrCreateThread,
  addMessage,
  closeAllThreadsForSource,
  buildMessageHistory,
} from "./thread-manager.ts";

// Events
import {
  EVENT_TYPES,
  getResponseEventType,
  UserMessageEventSchema,
} from "./events.ts";

const PILOT_VERSION = "3.0.0";

// ============================================================================
// Configuration
// ============================================================================

/** Thread timeout: messages within this window continue the same thread */
const DEFAULT_THREAD_TTL_MS = 5 * 60 * 1000; // 5 minutes

const config = {
  meshUrl: process.env.MESH_URL || "http://localhost:3000",
  meshToken: process.env.MESH_TOKEN,
  fastModel: process.env.FAST_MODEL || "google/gemini-2.5-flash",
  smartModel:
    process.env.SMART_MODEL ||
    process.env.FAST_MODEL ||
    "google/gemini-2.5-flash",
  threadWorkflow: process.env.THREAD_WORKFLOW || "thread",
  threadTtlMs: parseInt(
    process.env.THREAD_TTL_MS || String(DEFAULT_THREAD_TTL_MS),
    10,
  ),
};

// Parse event → workflow mapping from env
function getEventWorkflowMap(): Map<string, string> {
  const map = new Map<string, string>();
  const envMap = process.env.EVENT_WORKFLOW_MAP;
  if (envMap) {
    for (const pair of envMap.split(",")) {
      const [eventType, workflowId] = pair.split(":").map((s) => s.trim());
      if (eventType && workflowId) {
        map.set(eventType, workflowId);
      }
    }
  }
  return map;
}

const eventWorkflowMap = getEventWorkflowMap();

// Parse MESH_STATE from env (passed by mesh when spawning STDIO process)
interface BindingValue {
  __type: string;
  value: string;
}

function parseBindingsFromEnv(): {
  llm?: string;
  connection?: string;
  eventBus?: string;
  workflowStudio?: string;
} {
  const meshStateJson = process.env.MESH_STATE;
  if (!meshStateJson) return {};

  try {
    const state = JSON.parse(meshStateJson) as Record<string, BindingValue>;
    return {
      llm: state.LLM?.value,
      connection: state.CONNECTION?.value,
      eventBus: state.EVENT_BUS?.value,
      workflowStudio: state.WORKFLOW_STUDIO?.value,
    };
  } catch (e) {
    console.error("[pilot] Failed to parse MESH_STATE:", e);
    return {};
  }
}

// Initialize bindings from env vars
const envBindings = parseBindingsFromEnv();

// Binding connection IDs (from env or set via ON_MCP_CONFIGURATION)
let llmConnectionId: string | undefined = envBindings.llm;
let connectionBindingId: string | undefined = envBindings.connection;
let eventBusConnectionId: string | undefined = envBindings.eventBus;
let workflowStudioId: string | undefined = envBindings.workflowStudio;

// Log if we got bindings from env
if (
  envBindings.llm ||
  envBindings.connection ||
  envBindings.eventBus ||
  envBindings.workflowStudio
) {
  console.error("[pilot] ✅ Bindings from MESH_STATE env var:");
  if (envBindings.llm) console.error(`[pilot]   LLM: ${envBindings.llm}`);
  if (envBindings.connection)
    console.error(`[pilot]   CONNECTION: ${envBindings.connection}`);
  if (envBindings.eventBus)
    console.error(`[pilot]   EVENT_BUS: ${envBindings.eventBus}`);
  if (envBindings.workflowStudio)
    console.error(`[pilot]   WORKFLOW_STUDIO: ${envBindings.workflowStudio}`);
}

// ============================================================================
// Binding Schema
// ============================================================================

/**
 * Create a binding field schema.
 * @param bindingType - String binding type (e.g., "@deco/openrouter")
 */
const BindingOf = (bindingType: string) =>
  z.object({
    __type: z.literal(bindingType).default(bindingType),
    value: z.string().describe("Connection ID"),
  });

/**
 * Tool definitions for the WORKFLOW binding.
 * Used for tool-based connection matching.
 */
const WORKFLOW_BINDING_TOOLS = [
  { name: "COLLECTION_WORKFLOW_LIST" },
  { name: "COLLECTION_WORKFLOW_GET" },
];

/**
 * Create a binding field with tool-based matching.
 * Uses __binding with tool definitions for filtering.
 */
const BindingWithTools = (bindingType: string, tools: { name: string }[]) =>
  z.object({
    // Use a non-@ prefix binding type to avoid app_name filter
    __type: z.literal(bindingType).default(bindingType),
    value: z.string().describe("Connection ID"),
  });

const StateSchema = z.object({
  LLM: BindingOf("@deco/openrouter").describe("LLM for AI responses"),
  CONNECTION: BindingOf("@deco/connection").describe(
    "Access to mesh connections",
  ),
  EVENT_BUS: BindingOf("@deco/event-bus")
    .optional()
    .describe("Event bus for pub/sub"),
  // Use WORKFLOW (well-known binding name) instead of @deco/workflow
  // to enable tool-based matching
  WORKFLOW_STUDIO: BindingWithTools("WORKFLOW", WORKFLOW_BINDING_TOOLS)
    .optional()
    .describe("MCP Studio for workflow storage (PostgreSQL-backed)"),
});

/**
 * Post-process the state schema to inject binding tool definitions.
 * This works around limitations in Zod's literal types for complex values.
 */
function injectBindingSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const props = schema.properties as Record<string, Record<string, unknown>>;
  if (props?.WORKFLOW_STUDIO?.properties) {
    const wfProps = props.WORKFLOW_STUDIO.properties as Record<
      string,
      Record<string, unknown>
    >;
    // Inject __binding with tool definitions for tool-based matching
    wfProps.__binding = {
      const: WORKFLOW_BINDING_TOOLS,
    };
  }
  return schema;
}

// ============================================================================
// Mesh API Helpers
// ============================================================================

interface LLMContent {
  type: string;
  text?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  input?: string | Record<string, unknown>;
}

interface LLMResponse {
  text?: string;
  content?: LLMContent[];
}

async function callMeshTool<T = unknown>(
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!config.meshToken) {
    throw new Error("MESH_TOKEN not configured");
  }

  const response = await fetch(`${config.meshUrl}/mcp/${connectionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${config.meshToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[pilot] Mesh API error ${response.status}: ${errorText.slice(0, 200)}`,
    );

    // On auth errors, exit process so Mesh respawns with fresh credentials
    // This handles HMR/restart scenarios where old process has stale token
    if (response.status === 401 || response.status === 403) {
      console.error(`[pilot] ⚠️ Auth error. Credentials are stale.`);
      console.error(
        `[pilot] Exiting to allow Mesh to respawn with fresh credentials...`,
      );
      setTimeout(() => process.exit(1), 100);
      throw new Error(`Auth error (${response.status}). Process will restart.`);
    }

    throw new Error(`Mesh API error: ${response.status}`);
  }

  const json = (await response.json()) as {
    result?: {
      structuredContent?: T;
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    error?: { message: string };
  };

  if (json.error) {
    throw new Error(json.error.message);
  }

  // Check for tool error response (isError flag)
  if (json.result?.isError) {
    const errorText = json.result.content?.[0]?.text || "Unknown tool error";
    console.error(`[pilot] [callMeshTool] Tool error: ${errorText}`);
    throw new Error(`Tool error from ${toolName}: ${errorText}`);
  }

  if (json.result?.structuredContent) {
    return json.result.structuredContent;
  }

  if (json.result?.content?.[0]?.text) {
    try {
      return JSON.parse(json.result.content[0].text) as T;
    } catch {
      return json.result.content[0].text as T;
    }
  }

  return null as T;
}

const callLLM: LLMCallback = async (model, messages, tools) => {
  if (!llmConnectionId) {
    throw new Error("LLM binding not configured");
  }

  const prompt = messages.map((m) => {
    if (m.role === "system") {
      return { role: "system", content: m.content };
    }
    return { role: m.role, content: [{ type: "text", text: m.content }] };
  });

  const toolsForLLM = tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  // Build callOptions without undefined values (some LLM MCPs don't handle undefined well)
  const callOptions: Record<string, unknown> = {
    prompt,
    maxOutputTokens: 2048,
    temperature: 0.7,
  };
  if (toolsForLLM.length > 0) {
    callOptions.tools = toolsForLLM;
    callOptions.toolChoice = { type: "auto" };
  }

  const result = await callMeshTool<LLMResponse>(
    llmConnectionId,
    "LLM_DO_GENERATE",
    {
      modelId: model,
      callOptions,
    },
  );

  let text: string | undefined;
  if (result?.content) {
    const textPart = result.content.find((c) => c.type === "text");
    if (textPart?.text) text = textPart.text;
  }
  if (!text && result?.text) text = result.text;

  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> =
    [];
  const toolCallParts =
    result?.content?.filter((c) => c.type === "tool-call") || [];

  for (const tc of toolCallParts) {
    let parsedArgs: Record<string, unknown> = {};
    if (tc.args && typeof tc.args === "object") {
      parsedArgs = tc.args;
    } else if (tc.input) {
      if (typeof tc.input === "string") {
        try {
          parsedArgs = JSON.parse(tc.input);
        } catch {
          // empty
        }
      } else {
        parsedArgs = tc.input;
      }
    }

    if (tc.toolName) {
      toolCalls.push({ name: tc.toolName, arguments: parsedArgs });
    }
  }

  return { text, toolCalls };
};

const listMeshConnections: ListConnectionsCallback = async () => {
  if (!connectionBindingId) return [];

  try {
    const result = await callMeshTool<{
      items?: Array<{
        id: string;
        title: string;
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: unknown;
        }>;
      }>;
    }>(connectionBindingId, "COLLECTION_CONNECTIONS_LIST", {});

    return (result?.items || []).map((conn) => ({
      id: conn.id,
      title: conn.title,
      tools: conn.tools || [],
    }));
  } catch {
    return [];
  }
};

async function publishEvent(
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!eventBusConnectionId) {
    console.error(`[pilot] ⚠️ Cannot publish ${type}: no eventBusConnectionId`);
    return;
  }

  console.error(`[pilot] 📤 Publishing event: ${type}`);
  console.error(`[pilot]    Data: ${JSON.stringify(data).slice(0, 200)}`);

  try {
    const result = await callMeshTool(eventBusConnectionId, "EVENT_PUBLISH", {
      type,
      data,
    });
    console.error(
      `[pilot] ✅ Published ${type}: ${JSON.stringify(result).slice(0, 100)}`,
    );
  } catch (error) {
    console.error(`[pilot] ❌ Failed to publish ${type}:`, error);
  }
}

/**
 * Subscribe to events from the mesh event bus
 */
async function subscribeToEvents(): Promise<void> {
  if (!eventBusConnectionId) {
    console.error("[pilot] Cannot subscribe: EVENT_BUS not configured");
    return;
  }

  console.error(`[pilot] Subscribing via EVENT_BUS: ${eventBusConnectionId}`);

  // Get our connection ID from env (passed by mesh when spawning STDIO)
  // This is needed because we're subscribing via the gateway, but events
  // should be delivered to our actual connection
  const subscriberId = process.env.MESH_CONNECTION_ID;
  if (!subscriberId) {
    console.error(
      "[pilot] ⚠️ MESH_CONNECTION_ID not set, subscriptions may not work",
    );
  } else {
    console.error(`[pilot] Subscriber ID: ${subscriberId}`);
  }

  const eventsToSubscribe = [
    EVENT_TYPES.USER_MESSAGE,
    EVENT_TYPES.CONNECTION_CREATED,
    EVENT_TYPES.CONNECTION_DELETED,
  ];

  for (const eventType of eventsToSubscribe) {
    try {
      await callMeshTool(eventBusConnectionId, "EVENT_SUBSCRIBE", {
        eventType,
        subscriberId, // Use our actual connection ID
      });
      console.error(`[pilot] ✅ Subscribed to ${eventType}`);
    } catch (error) {
      console.error(`[pilot] ❌ Failed to subscribe to ${eventType}:`, error);
    }
  }
}

// ============================================================================
// Thread Handling (PostgreSQL-based)
// ============================================================================
interface HandleMessageResult {
  response: string;
  action: "reply" | "tool";
}

// ============================================================================
// Tool Summary Cache
// ============================================================================

/** Cache for available tools - avoid fetching on every message */
let availableToolsCache: {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    connectionId: string;
    connectionTitle: string;
  }>;
  timestamp: number;
} | null = null;
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate the tool cache.
 * Called when connections are added/removed from the mesh.
 */
function invalidateToolCache(): void {
  availableToolsCache = null;
}

/**
 * Get all available tools from Mesh connections.
 * Results are cached in memory for 5 minutes.
 */
async function getAvailableTools(): Promise<
  Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    connectionId: string;
    connectionTitle: string;
  }>
> {
  if (
    availableToolsCache &&
    Date.now() - availableToolsCache.timestamp < TOOL_CACHE_TTL_MS
  ) {
    return availableToolsCache.tools;
  }

  const meshConnections = await listMeshConnections();
  const tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    connectionId: string;
    connectionTitle: string;
  }> = [];

  for (const conn of meshConnections) {
    if (conn.tools && conn.tools.length > 0) {
      for (const tool of conn.tools) {
        // Skip internal/management tools
        if (
          tool.name.startsWith("COLLECTION_") ||
          tool.name.startsWith("EVENT_") ||
          tool.name === "ON_EVENTS" ||
          tool.name === "ON_MCP_CONFIGURATION" ||
          tool.name === "MCP_CONFIGURATION"
        ) {
          continue;
        }
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          connectionId: conn.id,
          connectionTitle: conn.title,
        });
      }
    }
  }

  availableToolsCache = { tools, timestamp: Date.now() };
  console.error(`[pilot] 🔧 Loaded ${tools.length} tools from Mesh`);
  return tools;
}

/**
 * Execute a tool call by routing to the correct Mesh connection.
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const tools = await getAvailableTools();
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    return { success: false, error: `Tool not found: ${toolName}` };
  }

  console.error(
    `[pilot] 🔧 Calling ${toolName} on ${tool.connectionTitle} (${tool.connectionId})`,
  );

  try {
    const result = await callMeshTool(tool.connectionId, toolName, args);
    return { success: true, result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[pilot] ❌ Tool call failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Publish a progress event to show what Pilot is doing.
 */
async function publishProgress(
  source: string,
  chatId: string | undefined,
  message: string,
  step?: string,
): Promise<void> {
  await publishEvent(EVENT_TYPES.TASK_PROGRESS, {
    taskId: chatId || "unknown",
    source,
    chatId,
    message,
    step,
  });
}

/**
 * Handle an incoming message using the fast router with tool calling.
 *
 * Flow:
 * 1. Get or create thread (continues if within TTL)
 * 2. Add user message to thread
 * 3. Call LLM with routing tool to decide action
 * 4. If tools needed, execute them and synthesize response
 * 5. Add final response to thread
 * 6. Publish response
 */
async function handleMessage(
  text: string,
  source: string,
  chatId?: string,
  options: { forceNewThread?: boolean } = {},
): Promise<HandleMessageResult> {
  console.error(
    `[pilot] 📨 handleMessage: "${text.slice(0, 50)}..." from ${source}`,
  );

  try {
    // Get or create thread (continues existing if within TTL)
    const thread = getOrCreateThread(
      source,
      chatId || `${source}-default`,
      options.forceNewThread,
    );

    // Add user message to thread (both file and in-memory)
    addMessage(thread.id, "user", text);
    thread.messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    // Check if we need to load tools (cache miss)
    const needsToolLoad =
      !availableToolsCache ||
      Date.now() - availableToolsCache.timestamp >= TOOL_CACHE_TTL_MS;

    if (needsToolLoad) {
      await publishProgress(
        source,
        chatId,
        "🔍 Loading available tools...",
        "tools",
      );
    }

    // Get available tools
    const availableTools = await getAvailableTools();
    let action: "reply" | "tool" = "reply";

    // Phase 1: Pass lightweight tools with minimal schema
    // Model will either respond with text OR call a tool to express intent
    const lightweightTools = availableTools.map((t) => ({
      name: t.name,
      description: t.description || `Tool: ${t.name}`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search/do" },
        },
      },
    }));

    const systemPrompt = `You are Pilot, a helpful AI assistant connected to MCP Mesh.

You have access to tools for searches, lookups, and external services.
- For greetings, small talk, or simple questions: respond directly with text
- For searches, lookups, or when user mentions a tool: call that tool
- Match the user's language (Portuguese/English)

Respond naturally and helpfully.`;

    // Progress: Thinking
    await publishProgress(source, chatId, "🧠 Thinking...", "llm");

    // Build messages with thread history for context
    const threadHistory = buildMessageHistory(thread);
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...threadHistory,
    ];

    // Single LLM call with lightweight tools
    console.error(
      `[pilot] 🎯 Phase 1: LLM call (${lightweightTools.length} tools available)`,
    );
    const result = await callLLM(config.fastModel, messages, lightweightTools);

    // Parse result: text OR tool calls
    let selectedToolNames: string[] = [];
    let directResponse = "";

    if (result.text?.trim()) {
      // Model responded with text - use it directly
      console.error(
        `[pilot] 💬 Direct response: "${result.text.slice(0, 100)}"`,
      );
      directResponse = result.text.trim();
    } else if (result.toolCalls?.length) {
      // Model wants to use tools - extract names
      selectedToolNames = result.toolCalls.map((tc) => tc.name);
      console.error(
        `[pilot] 🔧 Tool selection: ${selectedToolNames.join(", ")}`,
      );
    } else {
      // Fallback - no text and no tools
      console.error("[pilot] ⚠️ Empty response from LLM");
      directResponse = "Desculpe, não entendi. Pode reformular?";
    }

    console.error(
      `[pilot] 🔧 Selected tools: ${selectedToolNames.length > 0 ? selectedToolNames.join(", ") : "none"}`,
    );

    let response = "";

    if (selectedToolNames.length === 0) {
      // No tools needed - use the direct response
      response =
        directResponse ||
        selectionResult.text ||
        "Desculpe, não entendi. Pode reformular?";
    } else {
      // Tools needed - get full schemas for selected tools only
      action = "tool";
      const selectedTools = availableTools.filter((t) =>
        selectedToolNames.some(
          (name) => name.toLowerCase() === t.name.toLowerCase(),
        ),
      );

      if (selectedTools.length === 0) {
        console.error("[pilot] ⚠️ Selected tools not found in available tools");
        response =
          directResponse ||
          "Desculpe, não encontrei as ferramentas solicitadas.";
      } else {
        // Build full tool definitions for selected tools
        const toolsWithSchemas = selectedTools.map((t) => ({
          name: t.name,
          description: t.description || `Tool from ${t.connectionTitle}`,
          inputSchema: t.inputSchema || { type: "object", properties: {} },
        }));

        // Choose model based on number of tools
        const useSmartModel = selectedTools.length > 1;
        const modelToUse = useSmartModel ? config.smartModel : config.fastModel;

        console.error(
          `[pilot] 🤖 Phase 2: Using ${useSmartModel ? "smart" : "fast"} model with ${selectedTools.length} tool(s)`,
        );

        // Build execution prompt
        const executionSystemPrompt = `You are Pilot, a helpful AI assistant.

You have been asked to use specific tools to help the user. Use the tools provided to complete the task.

After using tools, synthesize the results into a helpful response.
Use Portuguese if the user writes in Portuguese.`;

        const executionMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: executionSystemPrompt },
          ...threadHistory,
        ];

        // Tool execution loop
        const MAX_TOOL_ITERATIONS = 5;

        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          console.error(
            `[pilot] 🔄 Tool loop iteration ${i + 1}/${MAX_TOOL_ITERATIONS}`,
          );

          const result = await callLLM(
            modelToUse,
            executionMessages,
            toolsWithSchemas,
          );

          console.error(
            `[pilot] 📊 LLM result: text=${result.text?.length ?? 0} chars, toolCalls=${result.toolCalls?.length ?? 0}`,
          );

          if (result.toolCalls && result.toolCalls.length > 0) {
            for (const toolCall of result.toolCalls) {
              await publishProgress(
                source,
                chatId,
                `🔧 Calling ${toolCall.name}...`,
                "tool",
              );

              console.error(
                `[pilot] 🔧 Tool call: ${toolCall.name}(${JSON.stringify(toolCall.arguments).slice(0, 200)})`,
              );

              const toolResult = await executeToolCall(
                toolCall.name,
                toolCall.arguments,
              );

              console.error(
                `[pilot] 📦 Tool result: success=${toolResult.success}, result=${JSON.stringify(toolResult.result ?? toolResult.error).slice(0, 200)}`,
              );

              executionMessages.push({
                role: "assistant",
                content: `[Called tool ${toolCall.name}]`,
              });
              executionMessages.push({
                role: "user",
                content: `Tool result: ${JSON.stringify(toolResult.result ?? toolResult.error).slice(0, 4000)}`,
              });
            }

            await publishProgress(
              source,
              chatId,
              "🧠 Processing results...",
              "llm",
            );
            continue;
          }

          // No more tool calls - we have a final response
          response = result.text || "";
          response = response.replace(/^REPLY\s*/i, "").trim();

          if (response) {
            break;
          }

          console.error("[pilot] ⚠️ LLM returned neither text nor tool calls");
          response = "Desculpe, não consegui processar sua mensagem.";
          break;
        }

        if (!response) {
          console.error(
            "[pilot] ⚠️ Exhausted tool iterations without final response",
          );
          response = "Desculpe, a operação excedeu o limite de iterações.";
        }
      }
    }

    // Add response to thread
    addMessage(thread.id, "assistant", response);

    // Progress: Replying
    await publishProgress(source, chatId, "💬 Replying...", "reply");

    console.error(`[pilot] ✅ Response: "${response.slice(0, 100)}..."`);

    // Publish response event
    const responseEventType = getResponseEventType(source);
    await publishEvent(responseEventType, {
      source,
      chatId,
      text: response,
      isFinal: true,
    });

    return {
      response,
      action,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[pilot] ❌ Error in handleMessage:", errorMsg);

    await publishProgress(source, chatId, "❌ Error: " + errorMsg, "error");

    // Still publish error response so CLI gets feedback
    const responseEventType = getResponseEventType(source);
    await publishEvent(responseEventType, {
      source,
      chatId,
      text: "Erro: " + errorMsg,
      isFinal: true,
    });

    return {
      response: "Erro: " + errorMsg,
      action: "reply",
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Initialize adapters from env bindings (critical for STDIO mode)
  // In STDIO mode, ON_MCP_CONFIGURATION is never called, so we must initialize here
  if (workflowStudioId && config.meshToken && !hasStudioClient()) {
    const studioClient = {
      callTool: async (toolName: string, args: Record<string, unknown>) =>
        callMeshTool(workflowStudioId!, toolName, args),
    };
    setWorkflowStudioClient(studioClient);
    initExecutionAdapter(studioClient);
    console.error("[pilot] ✅ Storage initialized from env bindings");
  }

  const server = new McpServer({
    name: "pilot",
    version: PILOT_VERSION,
  });

  // ==========================================================================
  // Configuration Tools
  // ==========================================================================

  server.registerTool(
    "MCP_CONFIGURATION",
    {
      title: "MCP Configuration",
      description: "Returns the configuration schema for this MCP server",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      // Convert Zod schema to JSON Schema format for Mesh UI
      const rawStateSchema = zodToJsonSchema(StateSchema, {
        $refStrategy: "none",
      });

      // Inject binding tool definitions for tool-based connection matching
      const stateSchema = injectBindingSchema(
        rawStateSchema as Record<string, unknown>,
      );

      const result = {
        stateSchema,
        scopes: [
          "LLM::LLM_DO_GENERATE",
          "LLM::COLLECTION_LLM_LIST",
          "CONNECTION::COLLECTION_CONNECTIONS_LIST",
          "CONNECTION::COLLECTION_CONNECTIONS_GET",
          "EVENT_BUS::*",
          "WORKFLOW_STUDIO::*", // All workflow studio tools
        ],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "ON_MCP_CONFIGURATION",
    {
      title: "Receive Configuration",
      description: "Receive configuration from Mesh",
      inputSchema: z.object({
        state: z.record(z.string(), z.any()).optional(),
        authorization: z.string().optional(),
        meshUrl: z.string().optional(),
      }),
    },
    async (args) => {
      const { state, authorization, meshUrl } = args;

      if (authorization) config.meshToken = authorization;
      if (meshUrl) config.meshUrl = meshUrl;
      if (state?.LLM?.value) llmConnectionId = state.LLM.value;
      if (state?.CONNECTION?.value)
        connectionBindingId = state.CONNECTION.value;
      if (state?.EVENT_BUS?.value) eventBusConnectionId = state.EVENT_BUS.value;
      if (state?.WORKFLOW_STUDIO?.value)
        workflowStudioId = state.WORKFLOW_STUDIO.value;

      console.error(`[pilot] Configuration received`);
      console.error(`[pilot]   LLM: ${llmConnectionId || "not set"}`);
      console.error(
        `[pilot]   CONNECTION: ${connectionBindingId || "not set"}`,
      );
      console.error(
        `[pilot]   EVENT_BUS: ${eventBusConnectionId || "not set"}`,
      );
      console.error(
        `[pilot]   WORKFLOW_STUDIO: ${workflowStudioId || "not set"}`,
      );

      // Initialize workflow studio adapter if binding is set
      if (workflowStudioId) {
        const studioClient = {
          callTool: async (toolName: string, args: Record<string, unknown>) =>
            callMeshTool(workflowStudioId!, toolName, args),
        };

        // Initialize workflow storage
        setWorkflowStudioClient(studioClient);

        // Initialize execution tracking
        initExecutionAdapter(studioClient);

        console.error("[pilot] ✅ Storage: MCP Studio (PostgreSQL)");
      } else {
        console.error(
          "[pilot] ⚠️ WORKFLOW_STUDIO not set - workflows will not work",
        );
      }

      // Subscribe to events after configuration is received
      if (eventBusConnectionId) {
        // Don't await - subscribe in background to not block config response
        subscribeToEvents().catch((e) =>
          console.error("[pilot] Event subscription error:", e),
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
        structuredContent: { success: true },
      };
    },
  );

  // ==========================================================================
  // Workflow Execution Tools
  // ==========================================================================

  server.registerTool(
    "WORKFLOW_START",
    {
      title: "Start Workflow",
      description:
        "Start a workflow execution synchronously. Returns task ID for tracking. NOTE: For async background tasks, use start_task() instead.",
      inputSchema: z.object({
        workflowId: z
          .string()
          .describe(
            "Workflow ID to execute (REQUIRED, e.g. 'quick-draft', 'create-article')",
          ),
        input: z
          .record(z.string(), z.any())
          .describe("Workflow input (e.g. { theme, notes, message })"),
        source: z
          .string()
          .optional()
          .describe("Source interface (whatsapp, cli, etc.)"),
        chatId: z.string().optional().describe("Chat/conversation ID"),
      }),
    },
    async (args) => {
      const { workflowId, input, source, chatId } = args;

      if (!workflowId) {
        throw new Error(
          "workflowId is required. Use list_workflows() to see available workflows.",
        );
      }

      const result = await startWorkflow(
        workflowId,
        input,
        source || "api",
        chatId,
      );

      return {
        content: [{ type: "text", text: result.response }],
        structuredContent: {
          response: result.response,
          taskId: result.task.taskId,
          status: result.task.status,
          workflowId: result.task.workflowId,
        },
      };
    },
  );

  server.registerTool(
    "MESSAGE",
    {
      title: "Handle Message",
      description:
        "Handle a message with thread continuation. If there's a recent execution (< 5 min), continues thread. Otherwise starts fresh.",
      inputSchema: z.object({
        text: z.string().describe("The message"),
        source: z.string().optional().describe("Source interface"),
        chatId: z.string().optional().describe("Chat/thread ID"),
        forceNewThread: z
          .boolean()
          .optional()
          .describe("Force starting a new thread instead of continuing"),
      }),
    },
    async (args) => {
      const { text, source, chatId, forceNewThread } = args;

      const result = await handleMessage(text, source || "api", chatId, {
        forceNewThread,
      });

      return {
        content: [{ type: "text", text: result.response }],
        structuredContent: {
          response: result.response,
          executionId: result.executionId,
          isFollowUp: result.isFollowUp,
        },
      };
    },
  );

  server.registerTool(
    "NEW_THREAD",
    {
      title: "Start New Thread",
      description:
        "Mark that the next message should start a fresh conversation. Use when user says 'new thread', 'nova conversa', 'start over', etc.",
      inputSchema: z.object({}),
    },
    async () => {
      // In PostgreSQL mode, threads expire by TTL automatically.
      // This tool is a semantic hint - the actual fresh start happens
      // when MESSAGE is called with forceNewThread: true
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Next message will start a new conversation.",
            }),
          },
        ],
        structuredContent: { success: true },
      };
    },
  );

  // ==========================================================================
  // Execution Tools (PostgreSQL-based via MCP Studio)
  // ==========================================================================

  server.registerTool(
    "EXECUTION_GET",
    {
      title: "Get Execution",
      description: "Get a workflow execution by ID",
      inputSchema: z.object({
        executionId: z.string().describe("Execution ID"),
      }),
    },
    async (args) => {
      const { executionId } = args;
      const execution = await getExecution(executionId);

      if (!execution) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Execution not found" }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(execution) }],
        structuredContent: execution,
      };
    },
  );

  server.registerTool(
    "EXECUTION_LIST",
    {
      title: "List Executions",
      description: "List recent workflow executions",
      inputSchema: z.object({
        limit: z.number().optional().describe("Max executions to return"),
        offset: z.number().optional().describe("Offset for pagination"),
      }),
    },
    async (args) => {
      const { limit, offset } = args;
      const executions = await listExecutions({ limit, offset });

      return {
        content: [{ type: "text", text: JSON.stringify({ executions }) }],
        structuredContent: {
          executions: executions.map((e) => ({
            id: e.id,
            workflow_id: e.workflow_id,
            status: e.status,
            created_at: e.created_at,
          })),
        },
      };
    },
  );

  // ==========================================================================
  // Workflow Management Tools
  // ==========================================================================

  server.registerTool(
    "WORKFLOW_LIST",
    {
      title: "List Workflows",
      description: "List all available workflows",
      inputSchema: z.object({}),
    },
    async () => {
      const workflows = await listWorkflows();
      return {
        content: [{ type: "text", text: JSON.stringify({ workflows }) }],
        structuredContent: {
          workflows: workflows.map((w) => ({
            id: w.id,
            title: w.title,
            description: w.description,
            stepCount: w.steps.length,
            steps: w.steps.map((s) => s.name),
          })),
        },
      };
    },
  );

  server.registerTool(
    "WORKFLOW_GET",
    {
      title: "Get Workflow",
      description: "Get a workflow by ID",
      inputSchema: z.object({
        workflowId: z.string().describe("Workflow ID"),
      }),
    },
    async (args) => {
      const { workflowId } = args;
      const workflow = await loadWorkflow(workflowId);

      if (!workflow) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Workflow not found" }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(workflow) }],
        structuredContent: workflow,
      };
    },
  );

  server.registerTool(
    "WORKFLOW_CREATE",
    {
      title: "Create Workflow",
      description: "Create a new workflow",
      inputSchema: z.object({
        id: z.string().describe("Unique workflow ID (kebab-case)"),
        title: z.string().describe("Human-readable title"),
        description: z.string().optional().describe("Description"),
        steps: z
          .array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              action: z.record(z.string(), z.any()),
              input: z.record(z.string(), z.any()).optional(),
              config: z.record(z.string(), z.any()).optional(),
            }),
          )
          .describe("Workflow steps"),
      }),
    },
    async (args) => {
      const workflow = args;
      await saveWorkflow(workflow as any);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, workflowId: workflow.id }),
          },
        ],
        structuredContent: { success: true, workflowId: workflow.id },
      };
    },
  );

  server.registerTool(
    "WORKFLOW_DUPLICATE",
    {
      title: "Duplicate Workflow",
      description:
        "Create an editable copy of a workflow (useful for customizing file-based workflows)",
      inputSchema: z.object({
        workflowId: z.string().describe("Workflow ID to duplicate"),
        newId: z.string().optional().describe("New workflow ID"),
        newTitle: z.string().optional().describe("New workflow title"),
      }),
    },
    async (args) => {
      const { workflowId, newId, newTitle } = args;
      const resultId = await duplicateWorkflow(workflowId, newId, newTitle);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              original: workflowId,
              duplicate: resultId,
            }),
          },
        ],
        structuredContent: {
          success: true,
          original: workflowId,
          duplicate: resultId,
        },
      };
    },
  );

  // ==========================================================================
  // Event Handler
  // ==========================================================================

  server.registerTool(
    "ON_EVENTS",
    {
      title: "Receive Events",
      description:
        "Receive CloudEvents from mesh. Routes to workflow based on EVENT_WORKFLOW_MAP.",
      inputSchema: z.object({
        events: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            source: z.string(),
            time: z.string().optional(),
            data: z.any(),
          }),
        ),
      }),
    },
    async (args) => {
      const { events } = args;

      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const event of events) {
        try {
          if (event.type === EVENT_TYPES.USER_MESSAGE) {
            const parsed = UserMessageEventSchema.safeParse(event.data);
            if (!parsed.success) {
              results[event.id] = {
                success: false,
                error: "Invalid event data",
              };
              continue;
            }

            const data = parsed.data;

            // Check for /new command - close current thread and start fresh
            const isNewThreadCommand =
              data.text.trim().toLowerCase() === "/new";
            if (isNewThreadCommand) {
              closeAllThreadsForSource(data.source);
              // Publish confirmation response
              const responseEventType = getResponseEventType(data.source);
              await publishEvent(responseEventType, {
                source: data.source,
                chatId: data.chatId,
                text: "🆕 Started new thread. Previous context cleared.",
                isFinal: true,
              });
              results[event.id] = { success: true };
              continue;
            }

            // IMPORTANT: Process asynchronously - don't block the EventBus worker!
            // Return success immediately, let message handling run in background
            handleMessage(data.text, data.source, data.chatId).catch(
              (error) => {
                console.error(
                  `[pilot] Background message handling failed for event ${event.id}:`,
                  error,
                );
              },
            );
            results[event.id] = { success: true };
          } else if (
            event.type === EVENT_TYPES.CONNECTION_CREATED ||
            event.type === EVENT_TYPES.CONNECTION_DELETED
          ) {
            // Connection lifecycle events - invalidate tool cache
            console.error(
              `[pilot] 🔄 Connection changed (${event.type}), invalidating tool cache`,
            );
            invalidateToolCache();
            results[event.id] = { success: true };
          } else {
            // Other events - just acknowledge for now
            console.error(`[pilot] Received unhandled event: ${event.type}`);
            results[event.id] = { success: true };
          }
        } catch (error) {
          results[event.id] = {
            success: false,
            error: error instanceof Error ? error.message : "Failed",
          };
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ results }) }],
        structuredContent: { results },
      };
    },
  );

  // ==========================================================================
  // Start Server
  // ==========================================================================

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Startup log - concise format
  console.error(`[pilot] Started v${PILOT_VERSION}`);

  // Subscribe to events if we have EVENT_BUS binding from env
  if (eventBusConnectionId) {
    // Small delay to ensure server is fully connected
    setTimeout(() => {
      subscribeToEvents().catch((e) =>
        console.error("[pilot] Event subscription error:", e),
      );
    }, 100);
  }
}

main().catch((error) => {
  console.error("[pilot] Fatal error:", error);
  process.exit(1);
});
