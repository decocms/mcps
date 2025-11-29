/**
 * Workflow Execution Locking
 *
 * Implements optimistic locking for workflow executions to prevent
 * concurrent execution of the same workflow. Uses timestamp-based
 * locking that works across SQLite, MySQL, and PostgreSQL.
 *
 * @see docs/WORKFLOW_EXECUTION_DESIGN.md Section 4.3
 */

import type { Env } from "../main.ts";

export interface LockResult {
  acquired: boolean;
  lockId?: string;
}

export interface LockConfig {
  /** Lock duration in milliseconds. Default: 5 minutes */
  durationMs?: number;
  /** Whether to log lock operations. Default: true */
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
export async function acquireLock(
  env: Env,
  executionId: string,
  config: LockConfig = {},
): Promise<LockResult> {
  const { durationMs = DEFAULT_LOCK_DURATION_MS, verbose = true } = config;

  const lockId = crypto.randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + durationMs);

  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          locked_at = $1, 
          locked_until = $2, 
          lock_id = $3,
          updated_at = $1
        WHERE id = $4 
          AND (locked_until IS NULL OR locked_until < $1)
          AND status IN ('pending', 'running')
        RETURNING id
      `,
      params: [now.toISOString(), lockUntil.toISOString(), lockId, executionId],
    });

    const acquired = (result.result[0]?.results?.length ?? 0) > 0;

    if (verbose) {
      console.log(
        `[LOCK] ${acquired ? "Acquired" : "Failed to acquire"} lock for ${executionId}`,
      );
    }

    return {
      acquired,
      lockId: acquired ? lockId : undefined,
    };
  } catch (error) {
    console.error(`[LOCK] Error acquiring lock for ${executionId}:`, error);
    return { acquired: false };
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
          locked_at = NULL, 
          locked_until = NULL, 
          lock_id = NULL,
          updated_at = $1
        WHERE id = $2 AND lock_id = $3
        RETURNING id
      `,
      params: [new Date().toISOString(), executionId, lockId],
    });

    const released = (result.result[0]?.results?.length ?? 0) > 0;

    if (released) {
      console.log(`[LOCK] Released lock for ${executionId}`);
    } else {
      console.warn(
        `[LOCK] Lock mismatch or already released for ${executionId}`,
      );
    }

    return released;
  } catch (error) {
    console.error(`[LOCK] Error releasing lock for ${executionId}:`, error);
    return false;
  }
}

/**
 * Extend an existing lock (refresh timeout).
 * Useful for long-running steps that need more time.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param lockId - The current lock ID
 * @param additionalMs - Additional milliseconds to extend the lock
 * @returns true if the lock was extended, false otherwise
 */
export async function extendLock(
  env: Env,
  executionId: string,
  lockId: string,
  additionalMs: number = DEFAULT_LOCK_DURATION_MS,
): Promise<boolean> {
  const newLockUntil = new Date(Date.now() + additionalMs);

  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET locked_until = $1, updated_at = $2
        WHERE id = $3 AND lock_id = $4
        RETURNING id
      `,
      params: [
        newLockUntil.toISOString(),
        new Date().toISOString(),
        executionId,
        lockId,
      ],
    });

    const extended = (result.result[0]?.results?.length ?? 0) > 0;

    if (extended) {
      console.log(`[LOCK] Extended lock for ${executionId}`);
    }

    return extended;
  } catch (error) {
    console.error(`[LOCK] Error extending lock for ${executionId}:`, error);
    return false;
  }
}

/**
 * Check if an execution is currently locked.
 * Useful for diagnostics and UI.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @returns Lock status information
 */
export async function getLockStatus(
  env: Env,
  executionId: string,
): Promise<{
  isLocked: boolean;
  lockedAt?: string;
  lockedUntil?: string;
  lockId?: string;
}> {
  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        SELECT locked_at, locked_until, lock_id 
        FROM workflow_executions 
        WHERE id = $1
      `,
      params: [executionId],
    });

    const row = result.result[0]?.results?.[0] as
      | {
          locked_at?: string;
          locked_until?: string;
          lock_id?: string;
        }
      | undefined;

    if (!row) {
      return { isLocked: false };
    }

    const now = new Date();
    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
    const isLocked = lockedUntil !== null && lockedUntil > now;

    return {
      isLocked,
      lockedAt: row.locked_at,
      lockedUntil: row.locked_until,
      lockId: row.lock_id,
    };
  } catch (error) {
    console.error(
      `[LOCK] Error checking lock status for ${executionId}:`,
      error,
    );
    return { isLocked: false };
  }
}

/**
 * Wrapper that executes a function while holding a lock.
 * Automatically acquires lock before execution and releases after.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param fn - Function to execute while holding the lock
 * @param config - Lock configuration options
 * @returns Result of the function or throws if lock couldn't be acquired
 */
export async function withLock<T>(
  env: Env,
  executionId: string,
  fn: (lockId: string) => Promise<T>,
  config: LockConfig = {},
): Promise<T> {
  const lock = await acquireLock(env, executionId, config);

  if (!lock.acquired || !lock.lockId) {
    throw new Error(
      `LOCKED: Could not acquire lock for execution ${executionId}`,
    );
  }

  try {
    return await fn(lock.lockId);
  } finally {
    await releaseLock(env, executionId, lock.lockId);
  }
}
