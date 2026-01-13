/**
 * Pilot MCP Server
 *
 * An AI agent that handles messages via the MCP Mesh event bus.
 *
 * Architecture:
 * - Fast Router: Inline LLM prompt that decides how to handle each message
 * - Threads: File-based JSON conversation tracking (~/.deco/pilot/threads/)
 * - Event-driven: Subscribes to user.message.received, publishes responses
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import {
  getOrCreateThread,
  addMessage,
  closeAllThreadsForSource,
  buildMessageHistory,
} from "./thread-manager.ts";

import {
  EVENT_TYPES,
  getResponseEventType,
  UserMessageEventSchema,
} from "./events.ts";

const PILOT_VERSION = "3.0.0";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_THREAD_TTL_MS = 5 * 60 * 1000; // 5 minutes

const config = {
  meshUrl: process.env.MESH_URL || "http://localhost:3000",
  meshToken: process.env.MESH_TOKEN,
  fastModel: process.env.FAST_MODEL || "google/gemini-2.5-flash",
  smartModel:
    process.env.SMART_MODEL ||
    process.env.FAST_MODEL ||
    "google/gemini-2.5-flash",
  threadTtlMs: parseInt(
    process.env.THREAD_TTL_MS || String(DEFAULT_THREAD_TTL_MS),
    10,
  ),
};

// Parse MESH_STATE from env (passed by mesh when spawning STDIO process)
interface BindingValue {
  __type: string;
  value: string;
}

// User API Key binding has additional fields
interface UserApiKeyBindingValue {
  __type: string;
  value: string; // The actual API key
  keyId?: string;
  userId?: string;
}

function parseBindingsFromEnv(): {
  llm?: string;
  agent?: string;
  eventBus?: string;
  userApiKey?: string;
} {
  const meshStateJson = process.env.MESH_STATE;
  if (!meshStateJson) return {};

  try {
    const state = JSON.parse(meshStateJson) as Record<
      string,
      BindingValue | UserApiKeyBindingValue
    >;
    return {
      llm: state.LLM?.value,
      agent: state.AGENT?.value,
      eventBus: state.EVENT_BUS?.value,
      userApiKey: state.USER_API_KEY?.value,
    };
  } catch (e) {
    console.error("[pilot] Failed to parse MESH_STATE:", e);
    return {};
  }
}

const envBindings = parseBindingsFromEnv();

// Binding connection IDs (from env or set via ON_MCP_CONFIGURATION)
let llmConnectionId: string | undefined = envBindings.llm;
let agentId: string | undefined = envBindings.agent;
let eventBusConnectionId: string | undefined = envBindings.eventBus;
// User API key for calling gateway with user's permissions
let userApiKey: string | undefined = envBindings.userApiKey;

if (
  envBindings.llm ||
  envBindings.agent ||
  envBindings.eventBus ||
  envBindings.userApiKey
) {
  console.error("[pilot] ✅ Bindings from MESH_STATE env var:");
  if (envBindings.llm) console.error(`[pilot]   LLM: ${envBindings.llm}`);
  if (envBindings.agent) console.error(`[pilot]   AGENT: ${envBindings.agent}`);
  if (envBindings.eventBus)
    console.error(`[pilot]   EVENT_BUS: ${envBindings.eventBus}`);
  if (envBindings.userApiKey)
    console.error(
      `[pilot]   USER_API_KEY: ${envBindings.userApiKey ? "set" : "not set"}`,
    );
}

// ============================================================================
// Binding Schema
// ============================================================================

const BindingOf = (bindingType: string) =>
  z.object({
    __type: z.literal(bindingType).default(bindingType),
    value: z.string().describe("Connection ID"),
  });

// User API Key binding has additional fields for API key management
const UserApiKeyBindingSchema = z.object({
  __type: z.literal("@deco/user-api-key").default("@deco/user-api-key"),
  value: z.string().describe("API key for calling Mesh on behalf of this user"),
  keyId: z.string().optional().describe("API key ID for management"),
  userId: z.string().optional().describe("User ID who owns this key"),
});

const StateSchema = z.object({
  LLM: BindingOf("@deco/openrouter").describe("LLM for AI responses"),
  AGENT: BindingOf("@deco/agent").describe(
    "Agent (gateway) for tool access (required)",
  ),
  EVENT_BUS: BindingOf("@deco/event-bus")
    .optional()
    .describe("Event bus for pub/sub"),
  USER_API_KEY: UserApiKeyBindingSchema.optional().describe(
    "API key for calling gateway with user's permissions (required for tool access)",
  ),
});

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

type LLMCallback = (
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
) => Promise<{
  text?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}>;

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

    if (response.status === 401 || response.status === 403) {
      console.error(`[pilot] ⚠️ Auth error. Exiting for respawn...`);
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

  if (json.result?.isError) {
    const errorText = json.result.content?.[0]?.text || "Unknown tool error";
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
    { modelId: model, callOptions },
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

async function callAgentTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  // Use userApiKey if available (has user's permissions), fall back to meshToken
  const authToken = userApiKey || config.meshToken;
  if (!authToken) {
    throw new Error(
      "No auth token available (neither USER_API_KEY nor MESH_TOKEN configured)",
    );
  }
  if (!agentId) {
    throw new Error("AGENT not configured");
  }

  const response = await fetch(`${config.meshUrl}/mcp/gateway/${agentId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent API error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  let json: {
    result?: { structuredContent?: T; content?: { text: string }[] };
    error?: { message: string };
  };

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) {
      throw new Error("Empty SSE response from Agent API");
    }
    json = JSON.parse(lastData.slice(6));
  } else {
    json = await response.json();
  }

  if (json.error) {
    throw new Error(`Agent tool error: ${json.error.message}`);
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

async function publishEvent(
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!eventBusConnectionId) {
    console.error(`[pilot] ⚠️ Cannot publish ${type}: no eventBusConnectionId`);
    return;
  }

  console.error(`[pilot] 📤 Publishing event: ${type}`);

  try {
    await callMeshTool(eventBusConnectionId, "EVENT_PUBLISH", { type, data });
    console.error(`[pilot] ✅ Published ${type}`);
  } catch (error) {
    console.error(`[pilot] ❌ Failed to publish ${type}:`, error);
  }
}

async function subscribeToEvents(): Promise<void> {
  if (!eventBusConnectionId) {
    console.error("[pilot] Cannot subscribe: EVENT_BUS not configured");
    return;
  }

  const subscriberId = process.env.MESH_CONNECTION_ID;
  if (!subscriberId) {
    console.error("[pilot] ⚠️ MESH_CONNECTION_ID not set");
  }

  const eventsToSubscribe = [
    EVENT_TYPES.USER_MESSAGE,
    EVENT_TYPES.CONNECTION_CREATED,
    EVENT_TYPES.CONNECTION_DELETED,
    "bridge.agent.info.requested",
  ];

  for (const eventType of eventsToSubscribe) {
    try {
      await callMeshTool(eventBusConnectionId, "EVENT_SUBSCRIBE", {
        eventType,
        subscriberId,
      });
      console.error(`[pilot] ✅ Subscribed to ${eventType}`);
    } catch (error) {
      console.error(`[pilot] ❌ Failed to subscribe to ${eventType}:`, error);
    }
  }
}

// ============================================================================
// Tool Cache
// ============================================================================

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
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateToolCache(): void {
  availableToolsCache = null;
}

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

  if (!agentId) {
    console.error("[pilot] ⚠️ AGENT not configured - no tools available");
    return [];
  }

  try {
    // Use userApiKey if available (has user's permissions), fall back to meshToken
    const authToken = userApiKey || config.meshToken;
    if (!authToken) {
      console.error("[pilot] ⚠️ No auth token available for getAvailableTools");
      return [];
    }

    const response = await fetch(`${config.meshUrl}/mcp/gateway/${agentId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/list",
        params: {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent API error (${response.status})`);
    }

    // Handle SSE response if needed
    const contentType = response.headers.get("Content-Type") || "";
    let json: { result?: { tools?: unknown[] }; error?: { message: string } };

    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      const lines = text.split("\n");
      const dataLines = lines.filter((line) => line.startsWith("data: "));
      const lastData = dataLines[dataLines.length - 1];
      if (!lastData) {
        throw new Error("Empty SSE response");
      }
      json = JSON.parse(lastData.slice(6));
    } else {
      json = await response.json();
    }
    if (json.error) {
      throw new Error(json.error.message || "Agent tools/list failed");
    }

    const toolsList = json.result?.tools || [];
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "main.ts:468",
        message: "Gateway tools/list raw response",
        data: {
          totalToolsFromGateway: toolsList.length,
          toolNames: toolsList
            .map((t: { name?: string }) => t.name)
            .slice(0, 20),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion
    const tools: Array<{
      name: string;
      description?: string;
      inputSchema?: unknown;
      connectionId: string;
      connectionTitle: string;
    }> = [];

    for (const tool of toolsList) {
      if (
        tool.name?.startsWith("COLLECTION_") ||
        tool.name?.startsWith("EVENT_") ||
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
        connectionId: tool.connectionId || agentId,
        connectionTitle: tool.connectionTitle || "Agent",
      });
    }

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "main.ts:497",
        message: "Filtered tools after exclusions",
        data: {
          filteredToolCount: tools.length,
          filteredToolNames: tools.map((t) => t.name),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion
    availableToolsCache = { tools, timestamp: Date.now() };
    console.error(`[pilot] 🔧 Loaded ${tools.length} tools from Agent`);
    return tools;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[pilot] ❌ Failed to load tools: ${errorMsg}`);
    return [];
  }
}

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!agentId) {
    return { success: false, error: "AGENT not configured" };
  }

  console.error(`[pilot] 🔧 Calling ${toolName}`);

  try {
    const result = await callAgentTool(toolName, args);
    return { success: true, result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[pilot] ❌ Tool call failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function publishProgress(
  source: string,
  chatId: string | undefined,
  message: string,
): Promise<void> {
  await publishEvent(EVENT_TYPES.TASK_PROGRESS, {
    taskId: chatId || "unknown",
    source,
    chatId,
    message,
  });
}

// ============================================================================
// Message Handling
// ============================================================================

interface HandleMessageResult {
  response: string;
  action: "reply" | "tool";
}

async function handleMessage(
  text: string,
  source: string,
  chatId?: string,
  options: { forceNewThread?: boolean } = {},
): Promise<HandleMessageResult> {
  console.error(`[pilot] 📨 handleMessage: "${text.slice(0, 50)}..."`);

  try {
    const thread = getOrCreateThread(
      source,
      chatId || `${source}-default`,
      options.forceNewThread,
    );

    addMessage(thread.id, "user", text);
    thread.messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    const availableTools = await getAvailableTools();

    const toolDefs = availableTools.map((t) => ({
      name: t.name,
      description: t.description || `Tool: ${t.name}`,
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));

    // Detect gateway mode based on available tools
    const toolNames = new Set(availableTools.map((t) => t.name));
    const isCodeExecutionMode =
      toolNames.has("GATEWAY_SEARCH_TOOLS") &&
      toolNames.has("GATEWAY_DESCRIBE_TOOLS") &&
      toolNames.has("GATEWAY_RUN_CODE");

    const codeExecutionPrompt = `You are Pilot, a helpful AI assistant connected to MCP Mesh.

## Gateway Tool Discovery Pattern (Code Execution Mode)

The gateway uses a code-execution strategy. To use external tools, you MUST complete ALL 3 steps:

### Step 1: SEARCH
Call \`GATEWAY_SEARCH_TOOLS\` with { query: "keyword" }
- Use specific keywords from the user's request (e.g., "perplexity", "weather", "search")
- Returns a list of matching tool names

### Step 2: DESCRIBE  
Call \`GATEWAY_DESCRIBE_TOOLS\` with { tools: ["tool_name"] }
- IMPORTANT: The parameter is called "tools" (not "toolNames")
- Use the EXACT tool names from search results (e.g., "perplexity_ask")
- Returns the input schema for each tool

### Step 3: EXECUTE (REQUIRED!)
Call \`GATEWAY_RUN_CODE\` with { code: "..." } containing JavaScript:
\`\`\`javascript
export default async (tools) => {
  const result = await tools.perplexity_ask({ 
    messages: [{ role: "user", content: "your query here" }] 
  });
  return result;
};
\`\`\`
- IMPORTANT: Use \`(tools)\` NOT \`({ tools })\` - tools is a direct parameter, not destructured
- Use the schema from Step 2 to construct the correct parameters
- ALWAYS complete this step to get actual results for the user
- DO NOT skip this step - the user needs real data

## CRITICAL RULES

- You MUST complete all 3 steps (SEARCH → DESCRIBE → EXECUTE) before responding to the user
- DO NOT stop after DESCRIBE - you need to call GATEWAY_RUN_CODE to get actual results
- DO NOT ask the user for clarification mid-workflow - complete all steps first
- If search returns no results, inform the user the tool doesn't exist
- Match user's language (Portuguese/English)`;

    const passthroughPrompt = `You are Pilot, a helpful AI assistant connected to MCP Mesh.

## Available Tools (Passthrough Mode)

You have direct access to ${availableTools.length} tools. Use function calling to invoke them directly.

Available tools: ${availableTools.map((t) => t.name).join(", ")}

## Rules

- Use function calling to invoke tools directly
- For greetings/simple questions: respond directly with text
- Match user's language (Portuguese/English)`;

    const systemPrompt = isCodeExecutionMode
      ? codeExecutionPrompt
      : passthroughPrompt;

    await publishProgress(source, chatId, "🧠 Thinking...");

    const threadHistory = buildMessageHistory(thread);
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...threadHistory,
    ];

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "main.ts:610",
        message: "Tools passed to LLM",
        data: {
          toolCount: toolDefs.length,
          toolNames: toolDefs.map((t) => t.name),
          userMessage: text.slice(0, 100),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion

    let action: "reply" | "tool" = "reply";
    let response = "";

    // LLM call with all tools
    const result = await callLLM(config.fastModel, messages, toolDefs);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "main.ts:620",
        message: "LLM response",
        data: {
          hasText: !!result.text,
          textPreview: result.text?.slice(0, 100),
          toolCallCount: result.toolCalls?.length || 0,
          toolCallNames: result.toolCalls?.map((tc) => tc.name),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion

    if (
      result.text?.trim() &&
      (!result.toolCalls || result.toolCalls.length === 0)
    ) {
      // Direct response
      response = result.text.trim();
      console.error(`[pilot] 💬 Direct response: "${response.slice(0, 100)}"`);
    } else if (result.toolCalls && result.toolCalls.length > 0) {
      // Tool execution loop
      action = "tool";
      const executionMessages = [...messages];
      const MAX_ITERATIONS = 20; // Allow enough iterations for SEARCH → DESCRIBE → EXECUTE workflow

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        console.error(`[pilot] 🔄 Iteration ${i + 1}/${MAX_ITERATIONS}`);

        const iterResult =
          i === 0
            ? result
            : await callLLM(config.smartModel, executionMessages, toolDefs);

        if (!iterResult.toolCalls || iterResult.toolCalls.length === 0) {
          response = iterResult.text?.replace(/^REPLY\s*/i, "").trim() || "";
          if (response) break;
          response = "Desculpe, não consegui processar sua mensagem.";
          break;
        }

        for (const toolCall of iterResult.toolCalls) {
          await publishProgress(source, chatId, `🔧 ${toolCall.name}...`);
          console.error(`[pilot] 🔧 ${toolCall.name}`);

          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "main.ts:780-args",
                message: "Tool call arguments",
                data: {
                  toolName: toolCall.name,
                  arguments: toolCall.arguments,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "G",
              }),
            },
          ).catch(() => {});
          // #endregion

          const toolResult = await executeToolCall(
            toolCall.name,
            toolCall.arguments,
          );

          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "main.ts:780-result",
                message: "Tool call result",
                data: {
                  toolName: toolCall.name,
                  success: toolResult.success,
                  resultPreview: JSON.stringify(
                    toolResult.result ?? toolResult.error,
                  ).slice(0, 500),
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "F",
              }),
            },
          ).catch(() => {});
          // #endregion

          executionMessages.push({
            role: "assistant",
            content: `[Called ${toolCall.name}]`,
          });
          executionMessages.push({
            role: "user",
            content: `Tool result: ${JSON.stringify(toolResult.result ?? toolResult.error).slice(0, 4000)}`,
          });
        }

        await publishProgress(source, chatId, "🧠 Processing...");
      }

      if (!response) {
        response = "Desculpe, a operação excedeu o limite de iterações.";
      }
    } else {
      response = "Desculpe, não entendi. Pode reformular?";
    }

    addMessage(thread.id, "assistant", response);
    await publishProgress(source, chatId, "💬 Replying...");

    console.error(`[pilot] ✅ Response: "${response.slice(0, 100)}..."`);

    const responseEventType = getResponseEventType(source);
    await publishEvent(responseEventType, {
      source,
      chatId,
      text: response,
      isFinal: true,
    });

    return { response, action };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[pilot] ❌ Error:", errorMsg);

    await publishProgress(source, chatId, "❌ Error: " + errorMsg);

    const responseEventType = getResponseEventType(source);
    await publishEvent(responseEventType, {
      source,
      chatId,
      text: "Erro: " + errorMsg,
      isFinal: true,
    });

    return { response: "Erro: " + errorMsg, action: "reply" };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
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
      const rawStateSchema = zodToJsonSchema(StateSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>;

      const result = {
        stateSchema: rawStateSchema,
        scopes: [
          "LLM::LLM_DO_GENERATE",
          "LLM::COLLECTION_LLM_LIST",
          "EVENT_BUS::*",
        ],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
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
      if (state?.AGENT?.value) agentId = state.AGENT.value;
      if (state?.EVENT_BUS?.value) eventBusConnectionId = state.EVENT_BUS.value;
      if (state?.USER_API_KEY?.value) userApiKey = state.USER_API_KEY.value;

      console.error(`[pilot] Configuration received`);
      console.error(`[pilot]   LLM: ${llmConnectionId || "not set"}`);
      console.error(`[pilot]   AGENT: ${agentId || "not set"}`);
      console.error(
        `[pilot]   EVENT_BUS: ${eventBusConnectionId || "not set"}`,
      );
      console.error(
        `[pilot]   USER_API_KEY: ${userApiKey ? "set" : "not set"}`,
      );

      if (eventBusConnectionId) {
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
  // Core Tools
  // ==========================================================================

  server.registerTool(
    "WORKFLOW_START",
    {
      title: "Start Workflow",
      description: "Start a workflow execution synchronously",
      inputSchema: z.object({
        workflowId: z.string().describe("Workflow ID to execute"),
        input: z.record(z.string(), z.any()).describe("Workflow input"),
        source: z.string().optional().describe("Source interface"),
        chatId: z.string().optional().describe("Chat ID"),
      }),
    },
    async (args) => {
      if (!agentId) throw new Error("AGENT not configured");

      const { workflowId, input, source, chatId } = args;

      const workflowResult = (await callAgentTool("COLLECTION_WORKFLOW_GET", {
        id: workflowId,
      })) as { item?: { id: string; gateway_id?: string } | null };

      if (!workflowResult.item) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const executionResult = (await callAgentTool(
        "COLLECTION_WORKFLOW_EXECUTION_CREATE",
        {
          workflow_collection_id: workflowId,
          input: {
            ...input,
            __meta: {
              source: source || "api",
              chatId,
              workflowType: "workflow",
            },
          },
          gateway_id: workflowResult.item.gateway_id || agentId,
          start_at_epoch_ms: Date.now(),
        },
      )) as { item?: { id: string } };

      if (!executionResult.item) {
        throw new Error("Failed to create workflow execution");
      }

      const executionId = executionResult.item.id;
      const maxWait = 30000;
      const pollInterval = 500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const exec = (await callAgentTool("COLLECTION_WORKFLOW_EXECUTION_GET", {
          id: executionId,
        })) as {
          item?: { status: string; output?: unknown; error?: unknown } | null;
        };

        if (!exec.item) throw new Error("Execution not found");

        if (exec.item.status === "success") {
          const output = exec.item.output as { response?: string } | undefined;
          return {
            content: [{ type: "text", text: output?.response || "Done" }],
            structuredContent: {
              response: output?.response || "Done",
              taskId: executionId,
              status: "success",
            },
          };
        }

        if (exec.item.status === "error" || exec.item.status === "failed") {
          throw new Error(
            (exec.item.error as { message?: string })?.message || "Failed",
          );
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      return {
        content: [{ type: "text", text: `Running (ID: ${executionId})` }],
        structuredContent: { taskId: executionId, status: "running" },
      };
    },
  );

  server.registerTool(
    "MESSAGE",
    {
      title: "Handle Message",
      description: "Handle a message with thread continuation",
      inputSchema: z.object({
        text: z.string().describe("The message"),
        source: z.string().optional().describe("Source interface"),
        chatId: z.string().optional().describe("Chat ID"),
        forceNewThread: z.boolean().optional().describe("Force new thread"),
      }),
    },
    async (args) => {
      const { text, source, chatId, forceNewThread } = args;

      const result = await handleMessage(text, source || "api", chatId, {
        forceNewThread,
      });

      return {
        content: [{ type: "text", text: result.response }],
        structuredContent: { response: result.response },
      };
    },
  );

  server.registerTool(
    "NEW_THREAD",
    {
      title: "Start New Thread",
      description: "Start a fresh conversation",
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
        structuredContent: { success: true },
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
      description: "Receive CloudEvents from mesh",
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
    async (args: {
      events: Array<{
        id: string;
        type: string;
        source: string;
        time?: string;
        data: unknown;
      }>;
    }) => {
      const { events } = args;
      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const event of events) {
        try {
          if (event.type === EVENT_TYPES.USER_MESSAGE) {
            const parsed = UserMessageEventSchema.safeParse(event.data);
            if (!parsed.success) {
              results[event.id] = { success: false, error: "Invalid data" };
              continue;
            }

            const data = parsed.data;

            if (data.text.trim().toLowerCase() === "/new") {
              closeAllThreadsForSource(data.source);
              await publishEvent(getResponseEventType(data.source), {
                source: data.source,
                chatId: data.chatId,
                text: "🆕 Started new thread.",
                isFinal: true,
              });
              results[event.id] = { success: true };
              continue;
            }

            handleMessage(data.text, data.source, data.chatId).catch((e) =>
              console.error(`[pilot] Error: ${e}`),
            );
            results[event.id] = { success: true };
          } else if (
            event.type === EVENT_TYPES.CONNECTION_CREATED ||
            event.type === EVENT_TYPES.CONNECTION_DELETED
          ) {
            invalidateToolCache();
            results[event.id] = { success: true };
          } else if (event.type === "bridge.agent.info.requested") {
            if (!agentId) {
              results[event.id] = { success: false, error: "No AGENT" };
              continue;
            }

            try {
              let gatewayInfo: {
                item?: { id: string; title: string };
              } | null = null;
              if (eventBusConnectionId) {
                try {
                  gatewayInfo = await callMeshTool(
                    eventBusConnectionId,
                    "COLLECTION_GATEWAY_GET",
                    { id: agentId },
                  );
                } catch {
                  // ignore
                }
              }

              // Use userApiKey for gateway calls (has user's permissions)
              const agentAuthToken = userApiKey || config.meshToken;
              const toolsResponse = await fetch(
                `${config.meshUrl}/mcp/gateway/${agentId}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/event-stream",
                    Authorization: `Bearer ${agentAuthToken}`,
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "tools/list",
                    params: {},
                  }),
                },
              );

              if (!toolsResponse.ok) {
                throw new Error(`API error (${toolsResponse.status})`);
              }

              // Handle SSE response if needed
              const contentType =
                toolsResponse.headers.get("Content-Type") || "";
              let toolsJson: { result?: { tools?: unknown[] } };

              if (contentType.includes("text/event-stream")) {
                const text = await toolsResponse.text();
                const lines = text.split("\n");
                const dataLines = lines.filter((line) =>
                  line.startsWith("data: "),
                );
                const lastData = dataLines[dataLines.length - 1];
                if (!lastData) {
                  throw new Error("Empty SSE response");
                }
                toolsJson = JSON.parse(lastData.slice(6));
              } else {
                toolsJson = await toolsResponse.json();
              }

              const toolsList = toolsJson.result?.tools || [];

              // #region agent log
              fetch(
                "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    location: "main.ts:1040",
                    message: "Agent info: raw tools from gateway",
                    data: {
                      totalTools: toolsList.length,
                      toolNames: toolsList
                        .map((t: { name?: string }) => t.name)
                        .slice(0, 20),
                    },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    runId: "run1",
                    hypothesisId: "B",
                  }),
                },
              ).catch(() => {});
              // #endregion

              const publicTools = toolsList.filter(
                (t: { name?: string }) =>
                  t.name &&
                  !t.name.startsWith("COLLECTION_") &&
                  !t.name.startsWith("EVENT_") &&
                  t.name !== "ON_EVENTS" &&
                  t.name !== "ON_MCP_CONFIGURATION" &&
                  t.name !== "MCP_CONFIGURATION",
              );

              // #region agent log
              fetch(
                "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    location: "main.ts:1055",
                    message: "Agent info: publishing response",
                    data: {
                      publicToolCount: publicTools.length,
                      publicToolNames: publicTools.map(
                        (t: { name: string }) => t.name,
                      ),
                      gatewayTitle: gatewayInfo?.item?.title,
                    },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    runId: "run1",
                    hypothesisId: "B",
                  }),
                },
              ).catch(() => {});
              // #endregion

              await publishEvent("agent.info.response", {
                id: agentId,
                title: gatewayInfo?.item?.title || `Agent`,
                tools: publicTools.map(
                  (t: { name: string; description?: string }) => ({
                    name: t.name,
                    description: t.description,
                  }),
                ),
              });

              results[event.id] = { success: true };
            } catch (error) {
              const errMsg =
                error instanceof Error ? error.message : String(error);
              console.error(`[pilot] ❌ Agent info failed: ${errMsg}`);
              results[event.id] = { success: false, error: errMsg };
            }
          } else {
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

  console.error(`[pilot] Started v${PILOT_VERSION}`);

  if (eventBusConnectionId) {
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
