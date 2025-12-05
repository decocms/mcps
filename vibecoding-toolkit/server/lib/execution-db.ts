/**
 * Direct Database Functions for Workflow Executions and Step Results
 *
 * These are internal engine functions, not exposed as collection tools.
 * They provide direct database access for the workflow execution engine.
 *
 * Follows DBOS patterns for durable workflow execution:
 * - Checkpoint-based step results
 * - Cancellation support with checkIfCancelled
 * - Atomic state transitions
 *
 * @see https://github.com/dbos-inc/dbos-transact-ts
 */

import {
  WorkflowExecution,
  WorkflowExecutionSchema,
  WorkflowExecutionStatus,
  WorkflowExecutionStepResult,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import type { Env } from "../main.ts";
import { WorkflowCancelledError } from "../workflow/errors.ts";

const safeJsonParse = (value: unknown): unknown => {
  if (!value) return undefined;
  try {
    return JSON.parse(value as string);
  } catch (error) {
    console.error("[DB] Failed to parse JSON:", error);
    return undefined;
  }
};

/**
 * Transform database row to WorkflowExecution
 */
function transformDbRowToExecution(
  row: Record<string, unknown> = {},
): WorkflowExecution {
  const transformed = {
    ...row,
    output: safeJsonParse(row.output),
    input: safeJsonParse(row.input),
  };

  return WorkflowExecutionSchema.parse(transformed);
}

/**
 * Get a workflow execution by ID
 */
export async function getExecution(
  env: Env,
  id: string,
): Promise<WorkflowExecution | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: "SELECT * FROM workflow_executions WHERE id = ? LIMIT 1",
    params: [id],
  });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? transformDbRowToExecution(row) : null;
}

/**
 * Create a new workflow execution
 */
export async function createExecution(
  env: Env,
  data: {
    workflow_id: string;
    input?: Record<string, unknown>;
  },
): Promise<WorkflowExecution> {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().getTime();
  const id = crypto.randomUUID();

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_executions (
        id, workflow_id, status, created_at, updated_at, created_by,
        input, retry_count, max_retries
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      RETURNING *
    `,
    params: [
      id,
      data.workflow_id,
      "pending",
      now,
      now,
      user?.id || null,
      JSON.stringify(data.input || {}),
      0,
      10,
    ],
  });

  return transformDbRowToExecution(
    result.result[0]?.results?.[0] as Record<string, unknown>,
  );
}

/**
 * Update a workflow execution
 */
export async function updateExecution(
  env: Env,
  id: string,
  data: Partial<{
    status: WorkflowExecutionStatus;
    output: unknown;
    error: string;
    input: Record<string, unknown>;
    started_at_epoch_ms: number;
    completed_at_epoch_ms: number;
    retry_count: number;
    max_retries: number;
    locked_until_epoch_ms: number;
    lock_id: string;
  }>,
): Promise<WorkflowExecution> {
  const now = new Date().getTime();

  const setClauses: string[] = [];
  const params: unknown[] = [];

  // Always update these fields
  setClauses.push(`updated_at = ?`);
  params.push(now);

  // Conditionally update other fields
  if (data.status !== undefined) {
    setClauses.push(`status = ?`);
    params.push(data.status);
  }
  if (data.output !== undefined) {
    setClauses.push(`output = ?`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = ?`);
    params.push(data.error);
  }
  if (data.input !== undefined) {
    setClauses.push(`input = ?`);
    params.push(JSON.stringify(data.input));
  }
  if (data.started_at_epoch_ms !== undefined) {
    setClauses.push(`started_at_epoch_ms = ?`);
    params.push(data.started_at_epoch_ms);
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = ?`);
    params.push(data.completed_at_epoch_ms);
  }
  if (data.retry_count !== undefined) {
    setClauses.push(`retry_count = ?`);
    params.push(data.retry_count);
  }
  if (data.max_retries !== undefined) {
    setClauses.push(`max_retries = ?`);
    params.push(data.max_retries);
  }
  if (data.locked_until_epoch_ms !== undefined) {
    setClauses.push(`locked_until_epoch_ms = ?`);
    params.push(data.locked_until_epoch_ms);
  }
  if (data.lock_id !== undefined) {
    setClauses.push(`lock_id = ?`);
    params.push(data.lock_id);
  }

  params.push(id);

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
      SET ${setClauses.join(", ")}
      WHERE id = ?
      RETURNING *
    `,
    params,
  });

  if (!result.result[0]?.results?.length) {
    throw new Error(`Workflow execution with id ${id} not found`);
  }

  return transformDbRowToExecution(
    result.result[0]?.results?.[0] as Record<string, unknown>,
  );
}

/**
 * Cancel a workflow execution.
 *
 * Sets status to 'cancelled' and prevents further execution unless the execution is resumed.
 * Does NOT stop currently running steps - they will complete but
 * subsequent steps won't start. The executor checks cancellation
 * at step boundaries via checkIfCancelled().
 *
 * @param env - Environment with database access
 * @param executionId - The execution ID to cancel
 * @returns The updated execution or null if not found
 */
export async function cancelExecution(
  env: Env,
  executionId: string,
): Promise<WorkflowExecution | null> {
  const now = Date.now();

  // Only cancel if currently pending or running
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
      SET 
        status = 'cancelled',
        updated_at = ?,
        completed_at_epoch_ms = ?,
        error = ?
      WHERE id = ? AND status IN ('pending', 'running')
      RETURNING *
    `,
    params: [now, now, "Execution cancelled by user", executionId],
  });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    // Check if execution exists but wasn't in cancellable state
    const existing = await getExecution(env, executionId);
    if (existing) {
      console.warn(
        `[CANCEL] Execution ${executionId} is ${existing.status}, cannot cancel`,
      );
      return existing;
    }
    return null;
  }

  console.log(`[CANCEL] Cancelled execution ${executionId}`);
  return transformDbRowToExecution(row);
}

/**
 * Check if an execution has been cancelled and throw if so.
 *
 * @param env - Environment with database access
 * @param executionId - The execution ID to check
 * @throws WorkflowCancelledError if the execution is cancelled
 */
export async function checkIfCancelled(
  env: Env,
  executionId: string,
): Promise<void> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: "SELECT status FROM workflow_executions WHERE id = ?",
    params: [executionId],
  });

  const row = result.result[0]?.results?.[0] as
    | { status: WorkflowExecutionStatus }
    | undefined;

  if (row?.status === "cancelled") {
    throw new WorkflowCancelledError(executionId, "Execution was cancelled");
  }
}

/**
 * Resume a cancelled execution.
 *
 * Sets status back to 'pending' so it can be re-queued.
 *
 * @param env - Environment with database access
 * @param scheduler - Scheduler for re-queuing
 * @param executionId - The execution ID to resume
 * @param options - Optional settings
 * @returns The updated execution or null if not found/resumable
 */
export async function resumeExecution(
  env: Env,
  executionId: string,
  options?: {
    /** Reset retry count to 0 (default: true) */
    resetRetries?: boolean;
  },
): Promise<WorkflowExecution | null> {
  const now = Date.now();
  const resetRetries = options?.resetRetries ?? true;

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
      SET 
        status = 'pending',
        updated_at = ?,
        completed_at_epoch_ms = NULL,
        error = NULL,
        locked_until_epoch_ms = NULL,
        lock_id = NULL
        ${resetRetries ? ", retry_count = 0" : ""}
      WHERE id = ? AND status = 'cancelled'
      RETURNING *
    `,
    params: [now, executionId],
  });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    return null;
  }

  return transformDbRowToExecution(row);
}

/**
 * List workflow executions with filtering
 */
export async function listExecutions(
  env: Env,
  options: {
    workflowId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{
  items: WorkflowExecution[];
  totalCount: number;
  hasMore: boolean;
}> {
  const { workflowId, status, limit = 50, offset = 0 } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (workflowId) {
    conditions.push(`workflow_id = ?`);
    params.push(workflowId);
  }
  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_executions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    params: [...params, limit, offset],
  });

  const countResult = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT COUNT(*) as count FROM workflow_executions ${whereClause}`,
    params,
  });

  const totalCount = parseInt(
    (countResult.result[0]?.results?.[0] as { count: string })?.count || "0",
    10,
  );

  const items = (result.result[0]?.results || []).map((row: unknown) =>
    transformDbRowToExecution(row as Record<string, unknown>),
  );

  return {
    items,
    totalCount,
    hasMore: offset + items.length < totalCount,
  };
}

/**
 * Transform database row to ExecutionStepResult
 */
function transformDbRowToStepResult(
  row: Record<string, unknown> = {},
): WorkflowExecutionStepResult {
  const transformed = {
    ...row,
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
  };

  return WorkflowExecutionStepResultSchema.parse(transformed);
}

/**
 * Get all step results for an execution
 */
export async function getStepResults(
  env: Env,
  executionId: string,
): Promise<WorkflowExecutionStepResult[]> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = ?`,
    params: [executionId],
  });

  return (result.result[0]?.results || []).map((row: unknown) =>
    transformDbRowToStepResult(row as Record<string, unknown>),
  );
}

/**
 * Get a specific step result
 */
export async function getStepResult(
  env: Env,
  executionId: string,
  stepId: string,
): Promise<WorkflowExecutionStepResult | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = ? AND step_id = ?`,
    params: [executionId, stepId],
  });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? transformDbRowToStepResult(row) : null;
}

export interface CreateStepResultOutcome {
  /** The step result (either newly created or existing) */
  result: WorkflowExecutionStepResult;
  /** Whether we won the race (created) or lost (conflict with existing) */
  created: boolean;
}

/**
 * Create a new step result, or detect if another worker already created it.
 *
 * Uses UNIQUE constraint to detect race conditions:
 * - If we create the record, we won the race → execute the step
 * - If UNIQUE conflict, we lost the race → DON'T execute, use existing result
 *
 * @returns CreateStepResultOutcome with created=false if we lost the race
 */
export async function createStepResult(
  env: Env,
  data: {
    execution_id: string;
    step_id: string;
    started_at_epoch_ms?: number;
  },
): Promise<CreateStepResultOutcome> {
  const startedAt = data.started_at_epoch_ms ?? Date.now();

  console.log("🚀 ~ createStepResult ~ data:", JSON.stringify(data, null, 2));

  // Try to INSERT - if UNIQUE conflict, RETURNING gives nothing
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO execution_step_results
      (execution_id, step_id, started_at_epoch_ms)
      VALUES (?, ?, ?)
      ON CONFLICT (execution_id, step_id) DO NOTHING
      RETURNING *
    `,
    params: [data.execution_id, data.step_id, startedAt],
  });

  console.log(
    "🚀 ~ createStepResult ~ result:",
    JSON.stringify(result, null, 2),
  );

  // If we got a row back, we won the race (created it)
  if (result.result[0]?.results?.length) {
    return {
      result: transformDbRowToStepResult(
        result.result[0].results[0] as Record<string, unknown>,
      ),
      created: true,
    };
  }

  // Conflict - fetch existing row (we lost the race)
  const existing = await getStepResult(env, data.execution_id, data.step_id);
  if (!existing) {
    throw new Error(
      `Failed to create or find step result for ${data.execution_id}/${data.step_id}`,
    );
  }

  return {
    result: existing,
    created: false,
  };
}

/**
 * Update a step result
 */
export async function updateStepResult(
  env: Env,
  executionId: string,
  stepId: string,
  data: Partial<{
    output: unknown;
    error: string;
    started_at_epoch_ms: number;
    completed_at_epoch_ms: number;
  }>,
): Promise<WorkflowExecutionStepResult> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.output !== undefined) {
    setClauses.push(`output = ?`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = ?`);
    params.push(data.error);
  }
  if (data.started_at_epoch_ms !== undefined) {
    setClauses.push(`started_at_epoch_ms = ?`);
    params.push(data.started_at_epoch_ms);
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = ?`);
    params.push(data.completed_at_epoch_ms);
  }

  if (!setClauses.length) {
    const existing = await getStepResult(env, executionId, stepId);
    if (!existing)
      throw new Error(`Step result not found: ${executionId}/${stepId}`);
    return existing;
  }

  params.push(executionId, stepId);

  // Don't overwrite a completed step
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE execution_step_results
      SET ${setClauses.join(", ")}
      WHERE execution_id = ? AND step_id = ? AND completed_at_epoch_ms IS NULL
      RETURNING *
    `,
    params,
  });

  // If no rows updated, the step was already completed (we lost the race)
  if (!result.result[0]?.results?.length) {
    const existing = await getStepResult(env, executionId, stepId);
    if (existing) return existing;
    throw new Error(`Step result not found: ${executionId}/${stepId}`);
  }

  return transformDbRowToStepResult(
    result.result[0]?.results?.[0] as Record<string, unknown>,
  );
}
