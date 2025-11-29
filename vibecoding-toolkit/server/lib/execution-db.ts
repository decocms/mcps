/**
 * Direct Database Functions for Workflow Executions and Step Results
 *
 * These are internal engine functions, not exposed as collection tools.
 * They provide direct database access for the workflow execution engine.
 */

import type { Env } from "../main.ts";
import {
  WorkflowExecutionSchema,
  ExecutionStepResultSchema,
  type WorkflowExecution,
  type ExecutionStepResult,
} from "../collections/workflow.ts";
import { ensureTable } from "./postgres.ts";

// ============================================================================
// Workflow Execution Functions
// ============================================================================

/**
 * Transform database row to WorkflowExecution
 */
function transformDbRowToExecution(
  row: Record<string, unknown> = {},
): WorkflowExecution {
  // Safe JSON parsing helper
  const safeJsonParse = (value: unknown): unknown => {
    if (!value) return undefined;
    try {
      return JSON.parse(value as string);
    } catch (error) {
      console.error('[DB] Failed to parse JSON:', error);
      return undefined;
    }
  };

  const transformed = {
    ...row,
    output: safeJsonParse(row.output),
    inputs: safeJsonParse(row.inputs),
    workflow_id: row.workflow_id as string,
    id: row.id as string,
    status: row.status as "pending" | "running" | "completed" | "failed" | "cancelled",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: row.created_by ? (row.created_by as string) : undefined,
    updated_by: row.updated_by ? (row.updated_by as string) : undefined,
    retry_count: row.retry_count ?? 0,
    max_retries: row.max_retries ?? 10,
    started_at_epoch_ms: row.started_at_epoch_ms ?? undefined,
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
  await ensureTable(env, "workflow_executions");

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: "SELECT * FROM workflow_executions WHERE id = $1 LIMIT 1",
    params: [id],
  });

  const row = result.result[0]?.results?.[0] as Record<string, unknown> | undefined;
  return row ? transformDbRowToExecution(row) : null;
}

/**
 * Create a new workflow execution
 */
export async function createExecution(
  env: Env,
  data: {
    workflow_id: string;
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    inputs?: Record<string, unknown>;
  },
): Promise<WorkflowExecution> {
  await ensureTable(env, "workflow_executions");

  const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_executions (
        id, workflow_id, status, created_at, updated_at, created_by, updated_by,
        inputs, retry_count, max_retries
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING *
    `,
    params: [
      id,
      data.workflow_id,
      data.status || "pending",
      now,
      now,
      user?.id || null,
      user?.id || null,
      JSON.stringify(data.inputs || {}),
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
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    output: Record<string, unknown>;
    error: string;
    recovery_attempts: number;
    workflow_timeout_ms: number;
    workflow_deadline_epoch_ms: number;
    inputs: Record<string, unknown>;
    started_at_epoch_ms: number;
    completed_at_epoch_ms: number;
    retry_count: number;
    max_retries: number;
    last_error: string;
    last_retry_at: string;
    locked_at: string;
    locked_until: string;
    lock_id: string;
  }>,
): Promise<WorkflowExecution> {
  await ensureTable(env, "workflow_executions");

  const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
  const now = new Date().toISOString();

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Always update these fields
  setClauses.push(`updated_at = $${paramIndex++}`);
  params.push(now);

  setClauses.push(`updated_by = $${paramIndex++}`);
  params.push(user?.id || null);

  // Conditionally update other fields
  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }
  if (data.output !== undefined) {
    setClauses.push(`output = $${paramIndex++}`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    params.push(data.error);
  }
  if (data.recovery_attempts !== undefined) {
    setClauses.push(`recovery_attempts = $${paramIndex++}`);
    params.push(data.recovery_attempts);
  }
  if (data.workflow_timeout_ms !== undefined) {
    setClauses.push(`workflow_timeout_ms = $${paramIndex++}`);
    params.push(data.workflow_timeout_ms);
  }
  if (data.workflow_deadline_epoch_ms !== undefined) {
    setClauses.push(`workflow_deadline_epoch_ms = $${paramIndex++}`);
    params.push(data.workflow_deadline_epoch_ms);
  }
  if (data.inputs !== undefined) {
    setClauses.push(`inputs = $${paramIndex++}`);
    params.push(JSON.stringify(data.inputs));
  }
  if (data.started_at_epoch_ms !== undefined) {
    setClauses.push(`started_at_epoch_ms = $${paramIndex++}`);
    params.push(data.started_at_epoch_ms);
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = $${paramIndex++}`);
    params.push(data.completed_at_epoch_ms);
  }
  if (data.retry_count !== undefined) {
    setClauses.push(`retry_count = $${paramIndex++}`);
    params.push(data.retry_count);
  }
  if (data.max_retries !== undefined) {
    setClauses.push(`max_retries = $${paramIndex++}`);
    params.push(data.max_retries);
  }
  if (data.last_error !== undefined) {
    setClauses.push(`last_error = $${paramIndex++}`);
    params.push(data.last_error);
  }
  if (data.last_retry_at !== undefined) {
    setClauses.push(`last_retry_at = $${paramIndex++}`);
    params.push(data.last_retry_at);
  }
  if (data.locked_at !== undefined) {
    setClauses.push(`locked_at = $${paramIndex++}`);
    params.push(data.locked_at);
  }
  if (data.locked_until !== undefined) {
    setClauses.push(`locked_until = $${paramIndex++}`);
    params.push(data.locked_until);
  }
  if (data.lock_id !== undefined) {
    setClauses.push(`lock_id = $${paramIndex++}`);
    params.push(data.lock_id);
  }

  params.push(id);

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
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
): Promise<{ items: WorkflowExecution[]; totalCount: number; hasMore: boolean }> {
  await ensureTable(env, "workflow_executions");

  const { workflowId, status, limit = 50, offset = 0 } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (workflowId) {
    conditions.push(`workflow_id = $${paramIndex++}`);
    params.push(workflowId);
  }
  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_executions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
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

// ============================================================================
// Execution Step Result Functions
// ============================================================================

/**
 * Transform database row to ExecutionStepResult
 */
function transformDbRowToStepResult(
  row: Record<string, unknown> = {},
): ExecutionStepResult {
  // Safe JSON parsing helper
  const safeJsonParse = (value: unknown, defaultValue: unknown = undefined): unknown => {
    if (!value) return defaultValue;
    try {
      return JSON.parse(value as string);
    } catch (error) {
      console.error('[DB] Failed to parse JSON:', error);
      return defaultValue;
    }
  };

  const transformed = {
    ...row,
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
    errors: safeJsonParse(row.errors, []) as Array<{ message: string; timestamp: string; attempt: number }>,
    attempt_count: (row.attempt_count ?? 1) as number,
  };

  return ExecutionStepResultSchema.parse(transformed);
}

/**
 * Get all step results for an execution
 */
export async function getStepResults(
  env: Env,
  executionId: string,
): Promise<ExecutionStepResult[]> {
  await ensureTable(env, "execution_step_results");

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = $1`,
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
): Promise<ExecutionStepResult | null> {
  await ensureTable(env, "execution_step_results");

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = $1 AND step_id = $2`,
    params: [executionId, stepId],
  });

  const row = result.result[0]?.results?.[0] as Record<string, unknown> | undefined;
  return row ? transformDbRowToStepResult(row) : null;
}

/**
 * Result of attempting to create a step result.
 * Used for detecting duplicate execution (contention handling).
 * 
 * @see https://www.dbos.dev/blog/scaleable-decentralized-workflows
 */
export interface CreateStepResultOutcome {
  /** The step result (either newly created or existing) */
  result: ExecutionStepResult;
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
    step_index?: number;
    status?: "pending" | "running" | "completed" | "failed";
    input?: Record<string, unknown>;
    child_workflow_id?: string;
    started_at_epoch_ms?: number;
  },
): Promise<CreateStepResultOutcome> {
  await ensureTable(env, "execution_step_results");

  const startedAt = data.started_at_epoch_ms ?? Date.now();
  const status = data.status || "running";

  // Try to INSERT - if UNIQUE conflict, RETURNING gives nothing
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO execution_step_results
      (execution_id, step_id, step_index, status, input, child_workflow_id, started_at_epoch_ms, attempt_count, errors)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (execution_id, step_id) DO NOTHING
      RETURNING *
    `,
    params: [
      data.execution_id,
      data.step_id,
      data.step_index ?? null,
      status,
      data.input ? JSON.stringify(data.input) : null,
      data.child_workflow_id ?? null,
      startedAt,
      1,
      "[]",
    ],
  });

  // If we got a row back, we won the race (created it)
  if (result.result[0]?.results?.length) {
    return {
      result: transformDbRowToStepResult(result.result[0].results[0] as Record<string, unknown>),
      created: true,
    };
  }

  // Conflict - fetch existing row (we lost the race)
  const existing = await getStepResult(env, data.execution_id, data.step_id);
  if (!existing) {
    throw new Error(`Failed to create or find step result for ${data.execution_id}/${data.step_id}`);
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
    status: "pending" | "running" | "completed" | "failed";
    input: Record<string, unknown>;
    output: unknown; // Can be object or array (forEach steps produce arrays)
    error: string;
    child_workflow_id: string;
    started_at_epoch_ms: number;
    completed_at_epoch_ms: number;
    attempt_count: number;
    last_error: string;
    errors: Array<{ message: string; timestamp: string; attempt: number }>;
  }>,
): Promise<ExecutionStepResult> {
  await ensureTable(env, "execution_step_results");

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }
  if (data.input !== undefined) {
    setClauses.push(`input = $${paramIndex++}`);
    params.push(JSON.stringify(data.input));
  }
  if (data.output !== undefined) {
    setClauses.push(`output = $${paramIndex++}`);
    params.push(JSON.stringify(data.output));
  }
  if (data.error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    params.push(data.error);
  }
  if (data.child_workflow_id !== undefined) {
    setClauses.push(`child_workflow_id = $${paramIndex++}`);
    params.push(data.child_workflow_id);
  }
  if (data.started_at_epoch_ms !== undefined) {
    setClauses.push(`started_at_epoch_ms = $${paramIndex++}`);
    params.push(data.started_at_epoch_ms);
  }
  if (data.completed_at_epoch_ms !== undefined) {
    setClauses.push(`completed_at_epoch_ms = $${paramIndex++}`);
    params.push(data.completed_at_epoch_ms);
  }
  if (data.attempt_count !== undefined) {
    setClauses.push(`attempt_count = $${paramIndex++}`);
    params.push(data.attempt_count);
  }
  if (data.last_error !== undefined) {
    setClauses.push(`last_error = $${paramIndex++}`);
    params.push(data.last_error);
  }
  if (data.errors !== undefined) {
    setClauses.push(`errors = $${paramIndex++}`);
    params.push(JSON.stringify(data.errors));
  }

  if (!setClauses.length) {
    const existing = await getStepResult(env, executionId, stepId);
    if (!existing) throw new Error(`Step result not found: ${executionId}/${stepId}`);
    return existing;
  }

  params.push(executionId, stepId);

  // Don't overwrite a completed step (contention safety)
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE execution_step_results
      SET ${setClauses.join(", ")}
      WHERE execution_id = $${paramIndex++} AND step_id = $${paramIndex} AND status != 'completed'
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

