/**
 * Workflow Execution Database Operations
 *
 * Internal engine functions for workflow execution persistence.
 * Uses DBOS patterns: checkpoint-based results, cancellation support.
 *
 * @see https://github.com/dbos-inc/dbos-transact-ts
 */

import {
  Step,
  WorkflowExecution,
  WorkflowExecutionStatus,
} from "@decocms/bindings/workflow";
import type { Env } from "../types/env.ts";
import {
  transformDbRowToExecution,
  transformDbRowToStepResult,
  WorkflowExecutionStepResult,
} from "../collections/workflow.ts";
import { runSQL } from "./postgres.ts";

export async function claimExecution(
  env: Env,
  executionId: string,
): Promise<WorkflowExecution | null> {
  const now = Date.now();

  // Atomic claim: only succeeds if status is 'enqueued'
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_execution
      SET 
        status = 'running',
        updated_at = ?
      WHERE id = ? AND (status = 'enqueued')
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
 * Get a workflow execution by ID
 */
export async function getExecution(
  env: Env,
  id: string,
): Promise<WorkflowExecution | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: "SELECT * FROM workflow_execution WHERE id = ? LIMIT 1",
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
    input?: Record<string, unknown> | null;
    steps: Step[];
    timeout_ms?: number | null;
    start_at_epoch_ms?: number | null;
  },
): Promise<{ id: string }> {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().getTime();
  const id = crypto.randomUUID();

  const startAtEpochMs = data.start_at_epoch_ms ?? now;
  const timeoutMs = data.timeout_ms;
  const deadlineAtEpochMs = timeoutMs ? startAtEpochMs + timeoutMs : undefined;

  const stepsJson = JSON.stringify(data.steps);
  const result = await runSQL<{ id: string }>(
    env,
    `INSERT INTO workflow_execution (id, workflow_id, status, created_at, updated_at, created_by, input, timeout_ms, start_at_epoch_ms, deadline_at_epoch_ms, steps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      id,
      data.workflow_id,
      "enqueued",
      now,
      now,
      user?.id || null,
      JSON.stringify(data.input || {}),
      timeoutMs,
      startAtEpochMs,
      deadlineAtEpochMs,
      stepsJson,
    ],
  );

  if (!result.length) {
    throw new Error(`Failed to create workflow execution`);
  }

  return { id: result[0].id };
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
    completed_at_epoch_ms: number;
  }>,
): Promise<{
  id: string;
  status: WorkflowExecutionStatus;
  output: unknown;
  error: string;
  completed_at_epoch_ms: number;
}> {
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
    setClauses.push(`output = ?::jsonb`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = ?::jsonb`);
    params.push(JSON.stringify(data.error));
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = ?`);
    params.push(data.completed_at_epoch_ms);
  }

  params.push(id);

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_execution
      SET ${setClauses.join(", ")}
      WHERE id = ?
      RETURNING id, status, output, error, completed_at_epoch_ms
    `,
    params,
  });

  if (!result.result[0]?.results?.length) {
    throw new Error(`Workflow execution with id ${id} not found`);
  }

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;

  return {
    id: row?.id as string,
    status: row?.status as WorkflowExecutionStatus,
    output: row?.output as unknown,
    error: row?.error as string,
    completed_at_epoch_ms: row?.completed_at_epoch_ms as number,
  };
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
): Promise<string | null> {
  const now = Date.now();

  // Only cancel if currently enqueued or running
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_execution
      SET 
        status = 'cancelled',
        updated_at = ?
      WHERE id = ? AND status IN ('enqueued', 'running')
      RETURNING id
    `,
    // error column is JSONB, so serialize it
    params: [now, executionId],
  });

  const id = result.result[0]?.results?.[0] as string | undefined;

  if (!id) {
    // Check if execution exists but wasn't in cancellable state
    return null;
  }

  return id;
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
): Promise<WorkflowExecution | null> {
  const now = Date.now();

  const result = await runSQL<WorkflowExecution>(
    env,
    `UPDATE workflow_execution SET status = 'enqueued', updated_at = ?, completed_at_epoch_ms = NULL WHERE id = ? AND status = 'cancelled' RETURNING *`,
    [now, executionId],
  );

  return result[0] ?? null;
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

  const result = await runSQL<Record<string, unknown>[]>(
    env,
    `
      SELECT * FROM workflow_execution
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  const totalCount = result.length;

  return {
    items: result.map((row) =>
      transformDbRowToExecution(row as unknown as Record<string, unknown>),
    ),
    totalCount,
    hasMore: offset + result.length < totalCount,
  };
}

// ============================================================================
// Step Results
// ============================================================================

export async function getStepResults(
  env: Env,
  executionId: string,
): Promise<WorkflowExecutionStepResult[]> {
  const result = await runSQL<WorkflowExecutionStepResult>(
    env,
    `SELECT * FROM workflow_execution_step_result WHERE execution_id = ?`,
    [executionId],
  );

  return (
    result.map((row) =>
      transformDbRowToStepResult(row as unknown as Record<string, unknown>),
    ) ?? []
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
  const result = await runSQL<WorkflowExecutionStepResult>(
    env,
    `SELECT * FROM workflow_execution_step_result WHERE execution_id = ? AND step_id = ?`,
    [executionId, stepId],
  );

  return result[0] ?? null;
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
    output?: unknown;
    error?: string;
    completed_at_epoch_ms?: number;
  },
): Promise<WorkflowExecutionStepResult> {
  // Try to INSERT - if UNIQUE conflict, RETURNING gives nothing
  const result = await runSQL<WorkflowExecutionStepResult>(
    env,
    `INSERT INTO workflow_execution_step_result (execution_id, step_id, started_at_epoch_ms, completed_at_epoch_ms, output, error) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (execution_id, step_id) DO NOTHING RETURNING *`,
    [
      data.execution_id,
      data.step_id,
      Date.now(),
      data.completed_at_epoch_ms ?? null,
      JSON.stringify(data.output),
      JSON.stringify(data.error),
    ],
  );

  return result[0];
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

  if (data.error !== undefined) {
    setClauses.push(`error = ?::jsonb`);
    params.push(JSON.stringify(data.error));
  }
  if (data.started_at_epoch_ms !== undefined) {
    setClauses.push(`started_at_epoch_ms = ?`);
    params.push(data.started_at_epoch_ms);
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = ?`);
    params.push(data.completed_at_epoch_ms);
  }
  if (data.output !== undefined) {
    setClauses.push(`output = ?::jsonb`);
    params.push(JSON.stringify(data.output));
  }

  if (setClauses.length === 0) {
    throw new Error("No fields to update");
  }

  params.push(executionId, stepId);

  const sql = `
    UPDATE workflow_execution_step_result
    SET ${setClauses.join(", ")}
    WHERE execution_id = ?::text AND step_id = ?::text
    RETURNING *
  `;

  // Don't overwrite a completed step
  const result = await runSQL<WorkflowExecutionStepResult>(env, sql, params);

  return result[0];
}
