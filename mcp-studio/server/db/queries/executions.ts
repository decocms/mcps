/**
 * Workflow Execution Database Operations
 *
 * Internal engine functions for workflow execution persistence.
 * Uses DBOS patterns: checkpoint-based results, cancellation support.
 *
 * @see https://github.com/dbos-inc/dbos-transact-ts
 */

import type {
  Step,
  WorkflowExecution,
  WorkflowExecutionStatus,
} from "@decocms/bindings/workflow";
import type { Env } from "../../types/env.ts";
import { runSQL } from "../postgres.ts";
import {
  transformDbRowToExecution,
  transformDbRowToStepResult,
  type WorkflowExecutionStepResult,
} from "../transformers.ts";

/**
 * Execution with workflow data joined
 */
export interface ExecutionWithWorkflow extends WorkflowExecution {
  workflow_id: string;
  steps: Step[];
  gateway_id: string;
}

export async function claimExecution(
  env: Env,
  executionId: string,
): Promise<ExecutionWithWorkflow | null> {
  const now = Date.now();

  // Atomic claim: only succeeds if status is 'enqueued'
  // Join with workflow table to get steps and gateway_id
  const result =
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
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

  const executionRow = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;

  if (!executionRow) {
    return null;
  }

  // Get the workflow data
  const workflowId = executionRow.workflow_id as string;
  console.log(
    `[EXECUTION] Claimed execution ${executionId}, fetching workflow ${workflowId}`,
  );
  const workflow = await getWorkflow(env, workflowId);

  if (!workflow) {
    throw new Error(
      `Workflow ${workflowId} not found for execution ${executionId}`,
    );
  }

  console.log(`[EXECUTION] Workflow data:`, {
    id: workflow.id,
    gateway_id: workflow.gateway_id,
    stepsCount: workflow.steps?.length ?? 0,
    steps: workflow.steps?.map((s: Step) => s.name) ?? [],
  });

  const execution = transformDbRowToExecution(executionRow);

  return {
    ...execution,
    workflow_id: workflowId,
    steps: workflow.steps,
    gateway_id: workflow.gateway_id,
  };
}

/**
 * Get a workflow execution by ID
 */
export async function getExecution(
  env: Env,
  id: string,
): Promise<WorkflowExecution | null> {
  const result =
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
      sql: "SELECT * FROM workflow_execution WHERE id = ? LIMIT 1",
      params: [id],
    });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? transformDbRowToExecution(row) : null;
}

/**
 * Create an immutable workflow record (snapshot of the workflow definition)
 */
export async function createWorkflow(
  env: Env,
  data: {
    workflow_collection_id?: string | null;
    gateway_id: string;
    input?: Record<string, unknown> | null;
    steps: Step[];
  },
): Promise<{ id: string }> {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = Date.now();
  const id = crypto.randomUUID();

  const stepsJson = JSON.stringify(data.steps);
  const result = await runSQL<{ id: string }>(
    env,
    `INSERT INTO workflow (id, workflow_collection_id, steps, input, gateway_id, created_at_epoch_ms, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      id,
      data.workflow_collection_id ?? null,
      stepsJson,
      JSON.stringify(data.input || {}),
      data.gateway_id,
      now,
      user?.id || null,
    ],
  );

  if (!result.length) {
    throw new Error(`Failed to create workflow`);
  }

  return { id: result[0].id };
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(
  env: Env,
  id: string,
): Promise<{
  id: string;
  workflow_collection_id: string | null;
  steps: Step[];
  input: Record<string, unknown> | null;
  gateway_id: string;
  created_at_epoch_ms: number;
  created_by: string | null;
} | null> {
  const result = await runSQL<Record<string, unknown>>(
    env,
    "SELECT * FROM workflow WHERE id = ? LIMIT 1",
    [id],
  );

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id as string,
    workflow_collection_id: row.workflow_collection_id as string | null,
    steps:
      typeof row.steps === "string"
        ? JSON.parse(row.steps)
        : (row.steps as Step[]),
    input:
      typeof row.input === "string"
        ? JSON.parse(row.input)
        : (row.input as Record<string, unknown> | null),
    gateway_id: row.gateway_id as string,
    created_at_epoch_ms: Number(row.created_at_epoch_ms),
    created_by: row.created_by as string | null,
  };
}

/**
 * Create a new workflow execution
 * First creates an immutable workflow record, then creates the execution referencing it
 */
export async function createExecution(
  env: Env,
  data: {
    gateway_id: string;
    input?: Record<string, unknown> | null;
    steps: Step[];
    timeout_ms?: number | null;
    start_at_epoch_ms?: number | null;
    workflow_collection_id?: string | null;
  },
): Promise<{ id: string; workflow_id: string }> {
  console.log(`[EXECUTION] Creating execution with data:`, {
    gateway_id: data.gateway_id,
    hasInput: !!data.input,
    stepsCount: data.steps?.length ?? 0,
    steps: data.steps?.map((s) => s.name) ?? [],
    workflow_collection_id: data.workflow_collection_id,
  });

  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = Date.now();

  // First, create an immutable workflow record
  const { id: workflowId } = await createWorkflow(env, {
    workflow_collection_id: data.workflow_collection_id,
    gateway_id: data.gateway_id,
    input: data.input,
    steps: data.steps,
  });

  // Then create the execution referencing the workflow
  const executionId = crypto.randomUUID();
  const startAtEpochMs = data.start_at_epoch_ms ?? now;
  const timeoutMs = data.timeout_ms;
  const deadlineAtEpochMs = timeoutMs ? startAtEpochMs + timeoutMs : undefined;

  const result = await runSQL<{ id: string }>(
    env,
    `INSERT INTO workflow_execution (id, workflow_id, status, created_at, updated_at, created_by, input, timeout_ms, start_at_epoch_ms, deadline_at_epoch_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      executionId,
      workflowId,
      "enqueued",
      now,
      now,
      user?.id || null,
      JSON.stringify(data.input || {}),
      timeoutMs ?? null,
      startAtEpochMs,
      deadlineAtEpochMs ?? null,
    ],
  );

  if (!result.length) {
    throw new Error(`Failed to create workflow execution`);
  }

  return { id: result[0].id, workflow_id: workflowId };
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
  const now = Date.now();

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

  const result = await runSQL<{
    id: string;
    status: WorkflowExecutionStatus;
    output: unknown;
    error: string;
    completed_at_epoch_ms: number;
  }>(
    env,
    `UPDATE workflow_execution SET ${setClauses.join(", ")} WHERE id = ? RETURNING id, status, output, error, completed_at_epoch_ms`,
    params,
  );
  return result[0];
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
  const result =
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
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
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{
  items: WorkflowExecution[];
  totalCount: number;
  hasMore: boolean;
}> {
  const { status, limit = 50, offset = 0 } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];
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
