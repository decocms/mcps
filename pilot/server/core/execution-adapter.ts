/**
 * Execution Adapter
 *
 * PostgreSQL-based execution tracking via MCP Studio.
 * Replaces file-based task-storage.ts.
 *
 * Key concept: "thread" is a workflow type that implements the basic agentic loop.
 * Thread continuation = finding recent thread execution and passing its history.
 */

import type { Workflow } from "../types/workflow.ts";

// ============================================================================
// Types
// ============================================================================

export interface ExecutionClient {
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

export type ExecutionStatus =
  | "enqueued"
  | "running"
  | "success"
  | "error"
  | "failed"
  | "cancelled";

export interface Execution {
  id: string;
  workflow_id: string;
  status: ExecutionStatus;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  created_at?: string;
  completed_at_epoch_ms?: number;
  completed_steps?: {
    success: string[];
    error: string[];
  };
}

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
}

// ============================================================================
// Client State
// ============================================================================

let client: ExecutionClient | null = null;
let defaultGatewayId: string | undefined;

/**
 * Initialize the execution adapter
 */
export function initExecutionAdapter(
  executionClient: ExecutionClient,
  gatewayId?: string,
): void {
  client = executionClient;
  defaultGatewayId = gatewayId;
  console.error("[execution-adapter] Initialized");
}

function requireClient(): ExecutionClient {
  if (!client) {
    throw new Error("Execution adapter not initialized");
  }
  return client;
}

// ============================================================================
// Execution CRUD
// ============================================================================

export interface CreateExecutionInput {
  workflowId: string;
  input: Record<string, unknown>;
  gatewayId?: string;
  metadata?: {
    source?: string;
    chatId?: string;
    workflowType?: string;
  };
}

/**
 * Create a new execution
 */
export async function createExecution(
  params: CreateExecutionInput,
): Promise<{ id: string; workflow_id: string }> {
  const c = requireClient();

  // Include metadata in input for later querying
  const executionInput = {
    ...params.input,
    __meta: params.metadata,
  };

  const result = (await c.callTool("COLLECTION_WORKFLOW_EXECUTION_CREATE", {
    workflow_collection_id: params.workflowId,
    input: executionInput,
    gateway_id: params.gatewayId || defaultGatewayId,
  })) as { id: string; workflow_id: string };

  console.error(`[execution-adapter] Created execution: ${result.id}`);
  return result;
}

/**
 * Get an execution by ID
 */
export async function getExecution(
  executionId: string,
): Promise<Execution | null> {
  const c = requireClient();

  try {
    const result = (await c.callTool("COLLECTION_WORKFLOW_EXECUTION_GET", {
      id: executionId,
    })) as { item: Execution };

    return result.item;
  } catch (error) {
    console.error(`[execution-adapter] Error getting execution:`, error);
    return null;
  }
}

/**
 * List executions with optional filtering
 */
export async function listExecutions(options?: {
  limit?: number;
  offset?: number;
}): Promise<Execution[]> {
  const c = requireClient();

  try {
    const result = (await c.callTool("COLLECTION_WORKFLOW_EXECUTION_LIST", {
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    })) as { items: Execution[] };

    return result.items || [];
  } catch (error) {
    console.error("[execution-adapter] Error listing executions:", error);
    return [];
  }
}

// ============================================================================
// Thread Continuation
// ============================================================================

const DEFAULT_THREAD_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ThreadContext {
  history: ThreadMessage[];
  previousExecutionId?: string;
}

/**
 * Find a continuable thread for the given source/chatId.
 *
 * A thread is continuable if:
 * - It's a "thread" type workflow execution
 * - Status is "success"
 * - Completed within TTL
 * - Same source and chatId
 */
export async function findContinuableThread(
  source: string,
  chatId?: string,
  ttlMs: number = DEFAULT_THREAD_TTL_MS,
): Promise<ThreadContext | null> {
  const executions = await listExecutions({ limit: 20 });

  const now = Date.now();

  for (const exec of executions) {
    // Must be successful
    if (exec.status !== "success") continue;

    // Must be within TTL
    if (exec.completed_at_epoch_ms) {
      const age = now - exec.completed_at_epoch_ms;
      if (age > ttlMs) continue;
    }

    // Check metadata
    const input = exec.input || {};
    const meta = input.__meta as
      | {
          source?: string;
          chatId?: string;
          workflowType?: string;
        }
      | undefined;

    // Must be a thread
    if (meta?.workflowType !== "thread") continue;

    // Must match source/chatId
    if (meta?.source !== source) continue;
    if (meta?.chatId !== chatId) continue;

    // Found a continuable thread - extract history
    const history = extractHistoryFromExecution(exec);

    console.error(
      `[execution-adapter] Found continuable thread: ${exec.id} (${history.length} messages)`,
    );

    return {
      history,
      previousExecutionId: exec.id,
    };
  }

  return null;
}

/**
 * Extract message history from a thread execution
 */
function extractHistoryFromExecution(exec: Execution): ThreadMessage[] {
  const history: ThreadMessage[] = [];
  const input = exec.input || {};
  const output = exec.output as Record<string, unknown> | undefined;

  // Include previous history from input
  const previousHistory = input.history as ThreadMessage[] | undefined;
  if (previousHistory && Array.isArray(previousHistory)) {
    history.push(...previousHistory);
  }

  // Add the message from this execution
  const message = input.message as string | undefined;
  if (message) {
    history.push({ role: "user", content: message });
  }

  // Add the response from output
  const response = output?.response as string | undefined;
  if (response) {
    history.push({ role: "assistant", content: response });
  }

  return history;
}

/**
 * Handle an incoming message with thread continuation.
 *
 * 1. Check for continuable thread
 * 2. Build history from previous execution
 * 3. Return context for running thread workflow
 */
export async function getThreadContext(
  source: string,
  chatId?: string,
  ttlMs?: number,
): Promise<ThreadContext> {
  const existing = await findContinuableThread(source, chatId, ttlMs);

  if (existing) {
    return existing;
  }

  // No continuable thread - start fresh
  return { history: [] };
}

// ============================================================================
// Execution Result Tracking
// ============================================================================

/**
 * Update execution with result (called by executor when done)
 * Note: mcp-studio's orchestrator handles this automatically,
 * but pilot's LLM executor needs to update manually.
 */
export async function updateExecutionResult(
  executionId: string,
  result: {
    status: ExecutionStatus;
    output?: unknown;
    error?: string;
  },
): Promise<void> {
  // Note: mcp-studio may not have an UPDATE tool for executions
  // In that case, pilot tracks state differently
  // For now, just log - the execution was created and we track locally
  console.error(
    `[execution-adapter] Execution ${executionId} ${result.status}`,
  );
}

// ============================================================================
// Thread Workflow Detection
// ============================================================================

/**
 * Check if a workflow is a "thread" type (basic agentic loop)
 */
export function isThreadWorkflow(workflow: Workflow): boolean {
  // Check for explicit type marker
  if ((workflow as { type?: string }).type === "thread") {
    return true;
  }

  // Check for "thread" in ID
  if (workflow.id === "thread" || workflow.id.startsWith("thread-")) {
    return true;
  }

  return false;
}

/**
 * Get the default thread workflow ID
 */
export function getDefaultThreadWorkflowId(): string {
  return process.env.THREAD_WORKFLOW || "thread";
}
