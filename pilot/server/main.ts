/**
 * Pilot MCP Server
 *
 * A workflow-based AI agent that orchestrates tasks across the MCP Mesh.
 * Implements the MCP Tasks specification (draft 2025-11-25).
 *
 * Key concepts:
 * - Workflows: Reusable task templates stored in workflows/
 * - Tasks: MCP-compliant persistent task state stored in TASKS_DIR
 * - Threads: Follow-up messages within 5 min are added to the same task
 * - Event Mapping: Route mesh events to specific workflows
 *
 * @see https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

// Types
import type { Task } from "./types/task.ts";

// Storage
import {
  loadTask,
  listTasks,
  cancelTask as cancelTaskInStorage,
  getTaskStats,
  cleanupExpiredTasks,
  getRecentThread,
  closeThread,
} from "./core/task-storage.ts";
import {
  loadWorkflow,
  listWorkflows,
  saveWorkflow,
  initializeDefaultWorkflows,
} from "./core/workflow-storage.ts";

// Executor
import {
  executeWorkflow,
  type LLMCallback,
  type ListConnectionsCallback,
} from "./core/workflow-executor.ts";

// Events
import {
  EVENT_TYPES,
  getResponseEventType,
  UserMessageEventSchema,
  type TaskCompletedEvent,
  type TaskProgressEvent,
  type TaskFailedEvent,
} from "./events.ts";

const PILOT_VERSION = "2.2.0";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_WORKFLOW_FALLBACK = "fast-router";

/** Thread timeout: messages within this window are added to existing task */
const THREAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const config = {
  meshUrl: process.env.MESH_URL || "http://localhost:3000",
  meshToken: process.env.MESH_TOKEN,
  fastModel: process.env.FAST_MODEL || "google/gemini-2.5-flash",
  smartModel:
    process.env.SMART_MODEL ||
    process.env.FAST_MODEL ||
    "google/gemini-2.5-flash",
  defaultWorkflow: process.env.DEFAULT_WORKFLOW || DEFAULT_WORKFLOW_FALLBACK,
  threadTimeoutMs: parseInt(
    process.env.THREAD_TIMEOUT_MS || String(THREAD_TIMEOUT_MS),
    10,
  ),
};

/**
 * Validate workflow configuration at startup.
 * Warns and falls back to default if configured workflow doesn't exist.
 */
function validateWorkflowConfig(): void {
  // Check default workflow
  const defaultWf = loadWorkflow(config.defaultWorkflow);
  if (!defaultWf) {
    console.error(
      `[pilot] ⚠️ WARNING: DEFAULT_WORKFLOW="${config.defaultWorkflow}" not found!`,
    );
    console.error(`[pilot]    Falling back to: ${DEFAULT_WORKFLOW_FALLBACK}`);
    config.defaultWorkflow = DEFAULT_WORKFLOW_FALLBACK;
  }
}

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
} {
  const meshStateJson = process.env.MESH_STATE;
  if (!meshStateJson) return {};

  try {
    const state = JSON.parse(meshStateJson) as Record<string, BindingValue>;
    return {
      llm: state.LLM?.value,
      connection: state.CONNECTION?.value,
      eventBus: state.EVENT_BUS?.value,
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

// Log if we got bindings from env
if (envBindings.llm || envBindings.connection || envBindings.eventBus) {
  console.error("[pilot] ✅ Bindings from MESH_STATE env var:");
  if (envBindings.llm) console.error(`[pilot]   LLM: ${envBindings.llm}`);
  if (envBindings.connection)
    console.error(`[pilot]   CONNECTION: ${envBindings.connection}`);
  if (envBindings.eventBus)
    console.error(`[pilot]   EVENT_BUS: ${envBindings.eventBus}`);
}

// ============================================================================
// Binding Schema
// ============================================================================

const BindingOf = (bindingType: string) =>
  z.object({
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

  const eventsToSubscribe = [EVENT_TYPES.USER_MESSAGE];

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
// Progress Handler
// ============================================================================

function createProgressHandler(source: string, chatId?: string) {
  return async (taskId: string, stepName: string, message: string) => {
    console.error(`[pilot] [${stepName}] ${message}`);

    await publishEvent(EVENT_TYPES.TASK_PROGRESS, {
      taskId,
      source,
      chatId,
      message,
    } satisfies TaskProgressEvent);
  };
}

// ============================================================================
// Workflow Execution
// ============================================================================

async function startWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  source: string,
  chatId?: string,
): Promise<{ response: string; task: Task }> {
  console.error(`[pilot] Starting workflow: ${workflowId}`);

  const result = await executeWorkflow(workflowId, input, {
    source,
    chatId,
    config: {
      fastModel: config.fastModel,
      smartModel: config.smartModel,
      onProgress: createProgressHandler(source, chatId),
      onModeChange: (mode) => console.error(`[pilot] Mode: ${mode}`),
    },
    callLLM,
    callMeshTool,
    listConnections: listMeshConnections,
    publishEvent,
  });

  const response = extractResponse(result.result, result.task);

  console.error(
    `[pilot] Task ${result.task.status}, response: "${response.slice(0, 100)}..."`,
  );

  const responseEventType = getResponseEventType(source);
  console.error(
    `[pilot] Publishing to: ${responseEventType} (chatId: ${chatId || "none"})`,
  );

  if (result.task.status === "completed") {
    await publishEvent(EVENT_TYPES.TASK_COMPLETED, {
      taskId: result.task.taskId,
      source,
      chatId,
      response,
      duration: Date.now() - new Date(result.task.createdAt).getTime(),
      toolsUsed: result.task.stepResults.flatMap(
        (s) => (s.output as { tools?: string[] })?.tools || [],
      ),
    } satisfies TaskCompletedEvent);

    await publishEvent(responseEventType, {
      taskId: result.task.taskId,
      source,
      chatId,
      text: response,
      isFinal: true,
    });
  } else {
    await publishEvent(EVENT_TYPES.TASK_FAILED, {
      taskId: result.task.taskId,
      source,
      chatId,
      error: result.task.error || "Unknown error",
      canRetry: true,
    } satisfies TaskFailedEvent);
  }

  return { response, task: result.task };
}

function extractResponse(result: unknown, task?: Task): string {
  // First, try to get response from result
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string" && r.response.trim()) return r.response;
    if (typeof r.text === "string" && r.text.trim()) return r.text;
  }

  // If result is empty/useless, look for response in earlier step outputs
  if (task?.stepResults) {
    // Check steps in reverse order (most recent first, but skip empty results)
    for (let i = task.stepResults.length - 1; i >= 0; i--) {
      const stepOutput = task.stepResults[i].output as Record<string, unknown>;
      if (stepOutput) {
        if (
          typeof stepOutput.response === "string" &&
          stepOutput.response.trim()
        ) {
          return stepOutput.response;
        }
        if (typeof stepOutput.text === "string" && stepOutput.text.trim()) {
          return stepOutput.text;
        }
        if (typeof stepOutput.task === "string" && stepOutput.task.trim()) {
          return stepOutput.task;
        }
      }
    }
  }

  // Fallback to original logic
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.task === "string") return r.task;
    return JSON.stringify(result);
  }
  return "Task completed.";
}

// ============================================================================
// Thread Handling (Simple Continuation Model)
// ============================================================================

/**
 * Handle a message with thread continuation.
 *
 * If there's a recent completed task (< 5 min) from the same source/chatId,
 * we include its history for context. Each message creates a new task,
 * but the "thread" is implicit from the shared history.
 */
interface HandleMessageOptions {
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  forceNewTask?: boolean;
}

async function handleMessage(
  text: string,
  source: string,
  chatId?: string,
  options: HandleMessageOptions = {},
): Promise<{ response: string; task: Task; isFollowUp: boolean }> {
  const { history = [], forceNewTask = false } = options;

  // Check for recent thread to continue (unless user wants new task)
  let threadHistory: Array<{ role: "user" | "assistant"; content: string }> =
    [];
  let isFollowUp = false;

  if (!forceNewTask) {
    const recentThread = getRecentThread(
      source,
      chatId,
      config.threadTimeoutMs,
    );

    if (recentThread) {
      console.error(
        `[pilot] Continuing thread from: ${recentThread.taskId} (passing history)`,
      );

      // Build history from the recent task
      threadHistory = buildHistoryFromTask(recentThread);
      isFollowUp = true;
    }
  }

  // Always create a new task, but include thread history for context
  const result = await startWorkflow(
    config.defaultWorkflow,
    { message: text, history: [...history, ...threadHistory] },
    source,
    chatId,
  );

  return {
    response: result.response,
    task: result.task,
    isFollowUp,
  };
}

/**
 * Build conversation history from a task's step outputs.
 * This creates the "thread context" for follow-up messages.
 */
function buildHistoryFromTask(
  task: Task,
): Array<{ role: "user" | "assistant"; content: string }> {
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  // First, include any history the task already had
  if (
    task.workflowInput?.history &&
    Array.isArray(task.workflowInput.history)
  ) {
    for (const h of task.workflowInput.history) {
      const entry = h as { role: string; content: string };
      if (
        entry.role &&
        entry.content &&
        (entry.role === "user" || entry.role === "assistant")
      ) {
        history.push({ role: entry.role, content: entry.content });
      }
    }
  }

  // Add the original message from this task
  if (task.workflowInput?.message) {
    history.push({
      role: "user",
      content: String(task.workflowInput.message),
    });
  }

  // Add the final response from this task
  if (task.result) {
    const result = task.result as Record<string, unknown>;
    const response = result.response || result.text;
    if (response && typeof response === "string") {
      history.push({ role: "assistant", content: response });
    }
  }

  return history;
}

// ============================================================================
// Event Routing
// ============================================================================

function getWorkflowForEvent(eventType: string): string {
  return eventWorkflowMap.get(eventType) || config.defaultWorkflow;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Initialize default workflows
  initializeDefaultWorkflows();

  // Validate workflow configuration (warn if env vars point to missing workflows)
  validateWorkflowConfig();

  // Cleanup expired tasks on startup
  const cleanedTasks = cleanupExpiredTasks();
  if (cleanedTasks > 0) {
    console.error(`[pilot] Cleaned up ${cleanedTasks} expired tasks`);
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
      const stateSchema = zodToJsonSchema(StateSchema, {
        $refStrategy: "none",
      });

      const result = {
        stateSchema,
        scopes: [
          "LLM::LLM_DO_GENERATE",
          "LLM::COLLECTION_LLM_LIST",
          "CONNECTION::COLLECTION_CONNECTIONS_LIST",
          "CONNECTION::COLLECTION_CONNECTIONS_GET",
          "EVENT_BUS::*",
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

      console.error(`[pilot] Configuration received`);
      console.error(`[pilot]   LLM: ${llmConnectionId || "not set"}`);
      console.error(
        `[pilot]   CONNECTION: ${connectionBindingId || "not set"}`,
      );
      console.error(
        `[pilot]   EVENT_BUS: ${eventBusConnectionId || "not set"}`,
      );

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
        "Smart message routing with thread continuation. If there's a recent task (< 5 min), adds as follow-up. Otherwise creates new task.",
      inputSchema: z.object({
        text: z.string().describe("The message"),
        source: z.string().optional().describe("Source interface"),
        chatId: z.string().optional().describe("Chat/thread ID"),
        forceNewTask: z
          .boolean()
          .optional()
          .describe("Force creating a new task instead of continuing thread"),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    },
    async (args) => {
      const { text, source, chatId, forceNewTask, history } = args;

      const result = await handleMessage(text, source || "api", chatId, {
        history,
        forceNewTask,
      });

      return {
        content: [{ type: "text", text: result.response }],
        structuredContent: {
          response: result.response,
          taskId: result.task.taskId,
          status: result.task.status,
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
        "Close the current conversation thread so the next message starts fresh. Use when user says 'new thread', 'nova conversa', 'start over', etc.",
      inputSchema: z.object({
        source: z.string().optional().describe("Source interface"),
        chatId: z.string().optional().describe("Chat/thread ID"),
      }),
    },
    async (args) => {
      const { source, chatId } = args;

      const closedTask = closeThread(source || "cli", chatId);

      if (!closedTask) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message:
                  "No active thread to close. Next message will start fresh.",
              }),
            },
          ],
          structuredContent: { success: true, hadActiveThread: false },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message:
                "Thread closed. Next message will start a new conversation.",
              closedTaskId: closedTask.taskId,
            }),
          },
        ],
        structuredContent: {
          success: true,
          hadActiveThread: true,
          closedTaskId: closedTask.taskId,
        },
      };
    },
  );

  // ==========================================================================
  // MCP Tasks Protocol Tools
  // ==========================================================================

  server.registerTool(
    "TASK_GET",
    {
      title: "Get Task",
      description: "Get the current state of a task (MCP Tasks: tasks/get)",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID"),
      }),
    },
    async (args) => {
      const { taskId } = args;
      const task = loadTask(taskId);

      if (!task) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: "Task not found" }) },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(task) }],
        structuredContent: {
          taskId: task.taskId,
          status: task.status,
          statusMessage: task.statusMessage,
          createdAt: task.createdAt,
          lastUpdatedAt: task.lastUpdatedAt,
          ttl: task.ttl,
          pollInterval: task.pollInterval,
        },
      };
    },
  );

  server.registerTool(
    "TASK_RESULT",
    {
      title: "Get Task Result",
      description:
        "Get the result of a completed task (MCP Tasks: tasks/result)",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID"),
      }),
    },
    async (args) => {
      const { taskId } = args;
      const task = loadTask(taskId);

      if (!task) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: "Task not found" }) },
          ],
          isError: true,
        };
      }

      if (task.status === "working" || task.status === "input_required") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Task not yet complete" }),
            },
          ],
          isError: true,
        };
      }

      if (task.status === "failed") {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: task.error }) },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(task.result) }],
        structuredContent: task.result as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "TASK_LIST",
    {
      title: "List Tasks",
      description: "List tasks with optional filtering (MCP Tasks: tasks/list)",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor"),
        limit: z.number().optional().describe("Max tasks to return"),
        status: z
          .enum([
            "working",
            "input_required",
            "completed",
            "failed",
            "cancelled",
          ])
          .optional(),
      }),
    },
    async (args) => {
      const { cursor, limit, status } = args;

      const result = listTasks({ cursor, limit, status });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: {
          tasks: result.tasks.map((t) => ({
            taskId: t.taskId,
            status: t.status,
            statusMessage: t.statusMessage,
            createdAt: t.createdAt,
            lastUpdatedAt: t.lastUpdatedAt,
            ttl: t.ttl,
            pollInterval: t.pollInterval,
          })),
          nextCursor: result.nextCursor,
        },
      };
    },
  );

  server.registerTool(
    "TASK_CANCEL",
    {
      title: "Cancel Task",
      description: "Cancel a running task (MCP Tasks: tasks/cancel)",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to cancel"),
      }),
    },
    async (args) => {
      const { taskId } = args;
      const task = cancelTaskInStorage(taskId);

      if (!task) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Task not found or already terminal",
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, taskId }) },
        ],
        structuredContent: { success: true, taskId },
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
      const workflows = listWorkflows();
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
      const workflow = loadWorkflow(workflowId);

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
      saveWorkflow(workflow as any);

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

  // ==========================================================================
  // Task Statistics
  // ==========================================================================

  server.registerTool(
    "TASK_STATS",
    {
      title: "Task Statistics",
      description: "Get task statistics",
      inputSchema: z.object({}),
    },
    async () => {
      const stats = getTaskStats();
      return {
        content: [{ type: "text", text: JSON.stringify(stats) }],
        structuredContent: stats,
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

            // IMPORTANT: Process asynchronously - don't block the EventBus worker!
            // Return success immediately, let workflow run in background
            handleMessage(data.text, data.source, data.chatId).catch(
              (error) => {
                console.error(
                  `[pilot] Background workflow failed for event ${event.id}:`,
                  error,
                );
              },
            );
            results[event.id] = { success: true };
          } else {
            // Route to mapped workflow or default - also async
            const workflowId = getWorkflowForEvent(event.type);
            startWorkflow(
              workflowId,
              event.data as Record<string, unknown>,
              event.source,
            ).catch((error) => {
              console.error(
                `[pilot] Background workflow failed for event ${event.id}:`,
                error,
              );
            });
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
