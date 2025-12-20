import type { Env } from "../../main.ts";

export interface LockResult {
  lockedExecution: {
    id: string;
    lockId: string;
    workflowId: string;
    input: Record<string, unknown>;
    maxRetries: number;
  };
}
export interface LockConfig {
  durationMs?: number;
  verbose?: boolean;
}

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Attempt to acquire an exclusive lock on a workflow execution.
 * Uses optimistic locking - only succeeds if no valid lock exists.
 *
 * The lock is acquired by atomically updating the lock columns
 * only if the current lock has expired or doesn't exist.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID to lock
 * @param config - Lock configuration options
 * @returns LockResult with acquired status and lockId if successful
 */
export async function lockWorkflowExecution(
  env: Env,
  executionId: string,
  config: LockConfig = {},
): Promise<LockResult> {
  const { durationMs = DEFAULT_LOCK_DURATION_MS } = config;

  const lockId = crypto.randomUUID();
  const now = Date.now();
  const lockUntil = now + durationMs;

  try {
    // Try to acquire lock with atomic UPDATE
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          locked_until_epoch_ms = ?, 
          lock_id = ?,
          updated_at = ?
        WHERE id = ? 
          AND (locked_until_epoch_ms IS NULL OR locked_until_epoch_ms < ?)
          AND status IN ('pending', 'running')
        RETURNING id, lock_id, workflow_id, input, max_retries
      `,
      params: [lockUntil, lockId, now, executionId, now],
    });

    // Check if WE got the lock (our lockId is now in the row)
    const check = await env.DATABASE.DATABASES_RUN_SQL({
      sql: "SELECT * FROM workflow_executions WHERE id = ?",
      params: [executionId],
    });

    const row = check.result[0]?.results?.[0] as
      | {
          id: string;
          lock_id: string | null;
          workflow_id: string;
          input: Record<string, unknown>;
          max_retries: number;
        }
      | undefined;
    const acquired = row?.lock_id === lockId;

    if (!acquired) {
      throw new Error(`Could not acquire lock for execution ${executionId}`);
    }

    if (!row?.workflow_id) {
      throw new Error(`Workflow not found for execution ${executionId}`);
    }

    if (!row.lock_id) {
      throw new Error(`Lock not found for execution ${executionId}`);
    }

    return {
      lockedExecution: {
        id: row.id,
        lockId: row.lock_id,
        workflowId: row.workflow_id,
        input: row.input ?? {},
        maxRetries: row.max_retries ?? 10,
      },
    };
  } catch (error) {
    console.error(`[LOCK] Error acquiring lock for ${executionId}:`, error);
    throw error;
  }
}
/**
 * Release a lock on a workflow execution.
 * Only releases if the lockId matches (prevents releasing someone else's lock).
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID to unlock
 * @param lockId - The lock ID that was returned when acquiring the lock
 * @returns true if the lock was released, false otherwise
 */
export async function releaseLock(
  env: Env,
  executionId: string,
  lockId: string,
): Promise<boolean> {
  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          locked_until_epoch_ms = NULL, 
          lock_id = NULL,
          updated_at = ?
        WHERE id = ? AND lock_id = ?
        RETURNING id
      `,
      params: [new Date().getTime(), executionId, lockId],
    });

    const released = (result.result[0]?.results?.length ?? 0) > 0;

    return released;
  } catch (error) {
    console.error(`[LOCK] Error releasing lock for ${executionId}:`, error);
    return false;
  }
}
