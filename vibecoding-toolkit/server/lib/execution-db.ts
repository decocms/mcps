/**
 * Workflow Execution Database Operations
 *
 * Internal engine functions for workflow execution persistence.
 * Uses DBOS patterns: checkpoint-based results, cancellation support.
 *
 * @see https://github.com/dbos-inc/dbos-transact-ts
 */

import {
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowExecutionStepResult,
} from "@decocms/bindings/workflow";
import type { Env } from "../main.ts";
import { executeWorkflow } from "server/workflow/executor.ts";
import {
  transformDbRowToExecution,
  transformDbRowToStepResult,
  safeJsonParse,
} from "../collections/workflow.ts";

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
    timeout_ms?: number;
    start_at_epoch_ms?: number;
  },
): Promise<WorkflowExecution> {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().getTime();
  const id = crypto.randomUUID();

  // Store the runtime context for background execution
  // This allows cron-triggered workflows to use the original user's auth
  const runtimeContext = env.MESH_REQUEST_CONTEXT
    ? {
        token: env.MESH_REQUEST_CONTEXT.token,
        meshUrl: env.MESH_REQUEST_CONTEXT.meshUrl,
        connectionId: env.MESH_REQUEST_CONTEXT.connectionId,
        authorization: env.MESH_REQUEST_CONTEXT.authorization,
      }
    : null;

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_executions (
        id, workflow_id, status, created_at, updated_at, created_by,
        input, timeout_ms, start_at_epoch_ms, runtime_context
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb
      )
      RETURNING *
    `,
    params: [
      id,
      data.workflow_id,
      "enqueued",
      now,
      now,
      user?.id || null,
      JSON.stringify(data.input || {}),
      data.timeout_ms ?? 0,
      data.start_at_epoch_ms ?? now,
      runtimeContext ? JSON.stringify(runtimeContext) : null,
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
    deadline_at_epoch_ms: number;
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
    setClauses.push(`output = ?::jsonb`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = ?::jsonb`);
    params.push(JSON.stringify(data.error));
  }
  if (data.input !== undefined) {
    setClauses.push(`input = ?::jsonb`);
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
  if (data.deadline_at_epoch_ms !== undefined) {
    setClauses.push(`deadline_at_epoch_ms = ?`);
    params.push(data.deadline_at_epoch_ms);
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
): Promise<string | null> {
  const now = Date.now();

  // Only cancel if currently enqueued or running
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
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

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
      SET 
        status = 'enqueued',
        updated_at = ?,
        completed_at_epoch_ms = NULL
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
 * List workflow executions with filtering
 */
export async function processEnqueuedExecutions(env: Env): Promise<string[]> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions SET status = 'running' WHERE status = 'enqueued' AND start_at_epoch_ms <= ? RETURNING id
    `,
    params: [Date.now()],
  });
  const ids =
    result.result[0]?.results?.map(
      (row: unknown) => (row as { id: string }).id,
    ) || [];

  for (const id of ids) {
    executeWorkflow(env, id).catch((error: Error) => {
      console.error(`[EXECUTE_WORKFLOW] Error executing workflow: ${error}`);
    });
  }

  return (
    result.result[0]?.results?.map(
      (row: unknown) => (row as { id: string }).id,
    ) || []
  );
}

// ============================================================================
// Step Results
// ============================================================================

export async function getStepResults(
  env: Env,
  executionId?: string,
): Promise<WorkflowExecutionStepResult[]> {
  const whereClause = executionId ? `WHERE execution_id = ?` : "";
  const params = executionId ? [executionId] : [];
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results ${whereClause}`,
    params,
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
    setClauses.push(`output = ?::jsonb`); // Add ::jsonb cast
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = ?::jsonb`); // Add ::jsonb cast
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

  if (!setClauses.length) {
    const existing = await getStepResult(env, executionId, stepId);
    if (!existing)
      throw new Error(`Step result not found: ${executionId}/${stepId}`);
    return existing;
  }

  params.push(executionId, stepId);

  const sql = `
    UPDATE execution_step_results
    SET ${setClauses.join(", ")}
    WHERE execution_id = ? AND step_id = ? AND completed_at_epoch_ms IS NULL
    RETURNING *
  `;

  // Don't overwrite a completed step
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql,
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

// ============================================================================
// Stream Chunks
// ============================================================================

export interface StreamChunk {
  id: string;
  execution_id: string;
  step_id: string;
  chunk_index: number;
  chunk_data: unknown;
  created_at: number;
}

export async function writeStreamChunk(
  env: Env,
  executionId: string,
  stepId: string,
  chunkIndex: number,
  chunkData: unknown,
): Promise<void> {
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `INSERT INTO step_stream_chunks (id, execution_id, step_id, chunk_index, chunk_data, created_at)
          VALUES (?, ?, ?, ?, ?::jsonb, ?) ON CONFLICT (execution_id, step_id, chunk_index) DO NOTHING`,
    params: [
      `${executionId}/${stepId}/${chunkIndex}`,
      executionId,
      stepId,
      chunkIndex,
      JSON.stringify(chunkData),
      Date.now(),
    ],
  });
}

export async function getStreamChunks(
  env: Env,
  executionId: string,
  lastSeenIndices: Record<string, number> = {},
): Promise<StreamChunk[]> {
  const params: unknown[] = [executionId];
  const stepConditions = Object.entries(lastSeenIndices).map(
    ([stepId, lastIndex], idx) => {
      params.push(stepId, lastIndex);
      return `(step_id = $${idx * 2 + 2} AND chunk_index > $${idx * 2 + 3})`;
    },
  );

  const seenStepIds = Object.keys(lastSeenIndices);
  let whereClause = "execution_id = $1";
  if (seenStepIds.length > 0) {
    const seenList = seenStepIds.map((s) => `'${s}'`).join(",");
    whereClause += ` AND ((${stepConditions.join(" OR ")}) OR step_id NOT IN (${seenList}))`;
  }

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM step_stream_chunks WHERE ${whereClause} ORDER BY created_at ASC, chunk_index ASC`,
    params,
  });

  return (result.result[0]?.results || []).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      execution_id: r.execution_id as string,
      step_id: r.step_id as string,
      chunk_index: Number(r.chunk_index),
      chunk_data: safeJsonParse(r.chunk_data),
      created_at: Number(r.created_at),
    };
  });
}

export async function deleteStreamChunks(
  env: Env,
  executionId: string,
  stepId?: string,
): Promise<void> {
  const sql = stepId
    ? `DELETE FROM step_stream_chunks WHERE execution_id = ? AND step_id = ?`
    : `DELETE FROM step_stream_chunks WHERE execution_id = ?`;
  await env.DATABASE.DATABASES_RUN_SQL({
    sql,
    params: stepId ? [executionId, stepId] : [executionId],
  });
}
