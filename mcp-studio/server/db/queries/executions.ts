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
  const result = await runSQL<Record<string, unknown>>(
    env,
    `
      UPDATE workflow_execution
      SET 
        status = 'running',
        updated_at = ?
      WHERE id = ? AND (status = 'enqueued')
      RETURNING *
    `,
    [now, executionId],
  );

  const executionRow = result[0];

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
): Promise<(WorkflowExecution & { workflow_id: string }) | null> {
  const result = await runSQL<Record<string, unknown>>(
    env,
    "SELECT * FROM workflow_execution WHERE id = ? LIMIT 1",
    [id],
  );

  const row = result[0] as Record<string, unknown> | undefined;
  return row
    ? {
        ...transformDbRowToExecution(row),
        workflow_id: row.workflow_id as string,
      }
    : null;
}

export async function getExecutionFull(
  env: Env,
  id: string,
): Promise<{
  execution: WorkflowExecution;
} | null> {
  const result = await runSQL<Record<string, unknown>>(
    env,
    `SELECT 
      we.*,
      COALESCE(
        (SELECT array_agg(step_id) 
         FROM workflow_execution_step_result 
         WHERE execution_id = we.id 
           AND started_at_epoch_ms IS NOT NULL
           AND completed_at_epoch_ms IS NULL
           AND error IS NULL),
        ARRAY[]::text[]
      ) as running_steps,
      COALESCE(
        (SELECT array_agg(json_build_object('name', step_id, 'completed_at_epoch_ms', completed_at_epoch_ms)::jsonb) 
         FROM workflow_execution_step_result 
         WHERE execution_id = we.id 
           AND completed_at_epoch_ms IS NOT NULL
           AND error IS NULL),
        ARRAY[]::jsonb[]
      ) as success_steps,
      COALESCE(
        (SELECT array_agg(step_id) 
         FROM workflow_execution_step_result 
         WHERE execution_id = we.id 
           AND error IS NOT NULL),
        ARRAY[]::text[]
      ) as error_steps
    FROM workflow_execution we
    WHERE we.id = ?`,
    [id],
  );

  const row = result[0];
  if (!row) return null;

  return {
    execution: transformDbRowToExecution(row),
  };
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
): Promise<{ id: string }> {
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
  options?: {
    onlyIfStatus?: WorkflowExecutionStatus;
  },
): Promise<{
  id: string;
  status: WorkflowExecutionStatus;
  output: unknown;
  error: string;
  completed_at_epoch_ms: number;
} | null> {
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

  // Build WHERE clause
  let whereClause = "WHERE id = ?";
  if (options?.onlyIfStatus) {
    whereClause += " AND status = ?";
    params.push(options.onlyIfStatus);
  }

  const result = await runSQL<{
    id: string;
    status: WorkflowExecutionStatus;
    output: unknown;
    error: string;
    completed_at_epoch_ms: number;
  }>(
    env,
    `UPDATE workflow_execution SET ${setClauses.join(", ")} ${whereClause} RETURNING id, status, output, error, completed_at_epoch_ms`,
    params,
  );
  return result[0] ?? null;
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
  const result = await runSQL<{ id: string }>(
    env,
    `
      UPDATE workflow_execution
      SET 
        status = 'cancelled',
        updated_at = ?
      WHERE id = ? AND status IN ('enqueued', 'running')
      RETURNING id
    `,
    // error column is JSONB, so serialize it
    [now, executionId],
  );

  return result[0]?.id ?? null;
}

/**
 * Resume a cancelled execution.
 *
 * Sets status back to 'enqueued' so it can be re-queued.
 * Clears any claimed-but-not-completed steps so they can be retried.
 *
 * @param env - Environment with database access
 * @param executionId - The execution ID to resume
 * @returns The updated execution or null if not found/resumable
 */
export async function resumeExecution(
  env: Env,
  executionId: string,
): Promise<WorkflowExecution | null> {
  const now = Date.now();

  // Clear any claimed-but-not-completed step results
  // These steps were interrupted when the execution was cancelled
  await runSQL(
    env,
    `DELETE FROM workflow_execution_step_result 
     WHERE execution_id = ? AND completed_at_epoch_ms IS NULL`,
    [executionId],
  );

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
    conditions.push(`we.status = ?`);
    params.push(status);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // Join with workflow table to get steps and gateway_id which are required by WorkflowExecutionSchema
  const result = await runSQL<Record<string, unknown>[]>(
    env,
    `
      SELECT 
        we.id,
        we.status,
        we.created_at,
        we.updated_at,
        we.start_at_epoch_ms,
        we.started_at_epoch_ms,
        we.completed_at_epoch_ms,
        we.timeout_ms,
        we.deadline_at_epoch_ms,
        we.created_by,
        w.gateway_id,
        COALESCE(wc.title, 'Workflow Execution') as title
      FROM workflow_execution we
      JOIN workflow w ON we.workflow_id = w.id
      LEFT JOIN workflow_collection wc ON w.workflow_collection_id = wc.id
      ${whereClause}
      ORDER BY we.created_at DESC
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
 * Get full execution context in a single query.
 * Returns execution status, workflow definition, and all step results.
 * This is the optimized path for step completion handling.
 */
export async function getExecutionContext(
  env: Env,
  executionId: string,
): Promise<{
  execution: { id: string; status: string; workflow_id: string };
  workflow: {
    steps: Step[];
    input: Record<string, unknown> | null;
    gateway_id: string;
  };
  stepResults: WorkflowExecutionStepResult[];
} | null> {
  // Single query with JOINs - gets everything we need
  const result = await runSQL<Record<string, unknown>>(
    env,
    `
    SELECT 
      e.id as execution_id,
      e.status,
      e.workflow_id,
      w.steps,
      w.input as workflow_input,
      w.gateway_id,
      COALESCE(
        json_agg(
          json_build_object(
            'step_id', sr.step_id,
            'execution_id', sr.execution_id,
            'started_at_epoch_ms', sr.started_at_epoch_ms,
            'completed_at_epoch_ms', sr.completed_at_epoch_ms,
            'output', sr.output,
            'error', sr.error
          )
        ) FILTER (WHERE sr.step_id IS NOT NULL),
        '[]'::json
      ) as step_results
    FROM workflow_execution e
    JOIN workflow w ON e.workflow_id = w.id
    LEFT JOIN workflow_execution_step_result sr ON sr.execution_id = e.id
    WHERE e.id = ?
    GROUP BY e.id, w.id
    `,
    [executionId],
  );

  const row = result[0];
  if (!row) return null;

  const stepResultsRaw =
    typeof row.step_results === "string"
      ? JSON.parse(row.step_results)
      : row.step_results;

  return {
    execution: {
      id: row.execution_id as string,
      status: row.status as string,
      workflow_id: row.workflow_id as string,
    },
    workflow: {
      steps:
        typeof row.steps === "string"
          ? JSON.parse(row.steps)
          : (row.steps as Step[]),
      input:
        typeof row.workflow_input === "string"
          ? JSON.parse(row.workflow_input)
          : (row.workflow_input as Record<string, unknown> | null),
      gateway_id: row.gateway_id as string,
    },
    stepResults: (stepResultsRaw as Record<string, unknown>[]).map((sr) =>
      transformDbRowToStepResult(sr),
    ),
  };
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
 * Get step completion status (lightweight query for orchestration).
 * Returns which steps are completed vs still running.
 * Fast: only fetches step_id + completion flag, no output data.
 */
export async function getStepCompletionStatus(
  env: Env,
  executionId: string,
): Promise<{
  completedSteps: string[];
  runningSteps: string[];
}> {
  const result = await runSQL<{
    step_id: string;
    completed_at_epoch_ms: number | null;
  }>(
    env,
    `SELECT step_id, completed_at_epoch_ms 
     FROM workflow_execution_step_result 
     WHERE execution_id = ?`,
    [executionId],
  );

  const completedSteps: string[] = [];
  const runningSteps: string[] = [];

  for (const row of result) {
    if (row.completed_at_epoch_ms) {
      completedSteps.push(row.step_id);
    } else {
      runningSteps.push(row.step_id);
    }
  }

  return { completedSteps, runningSteps };
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
 * Get step results by prefix (for forEach iterations)
 * Returns all step results where step_id starts with the given prefix
 */
export async function getStepResultsByPrefix(
  env: Env,
  executionId: string,
  prefix: string,
): Promise<WorkflowExecutionStepResult[]> {
  const result = await runSQL<Record<string, unknown>>(
    env,
    `SELECT * FROM workflow_execution_step_result 
     WHERE execution_id = ? AND step_id LIKE ?
     ORDER BY step_id`,
    [executionId, `${prefix}%`],
  );

  return result.map((row) => transformDbRowToStepResult(row));
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
