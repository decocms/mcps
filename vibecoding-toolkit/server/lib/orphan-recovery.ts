/**
 * Orphan Recovery
 *
 * Recovers workflow executions that got stuck due to worker crashes,
 * network issues, or other failures. This is essential for serverless
 * environments where there's no persistent background process.
 *
 * Usage:
 * - In Cloudflare Workers: Add a cron trigger that calls recoverOrphanedExecutions
 * - In Node.js: The PollingScheduler handles this automatically
 *
 * @see docs/WORKFLOW_EXECUTION_DESIGN.md
 */

import type { Env } from "../main.ts";
import type { QueueMessage } from "../collections/workflow.ts";
import { ensureTable } from "./postgres.ts";

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  /**
   * Maximum number of orphans to recover per invocation.
   * Prevents overwhelming the queue. Default: 100
   */
  limit?: number;

  /**
   * How long a lock must be expired before considering it orphaned.
   * Adds buffer time to prevent premature recovery. Default: 60000 (1 minute)
   */
  lockExpiryBufferMs?: number;

  /**
   * Maximum age of execution to recover (ms).
   * Very old executions might be better handled manually. Default: 24 hours
   */
  maxAgeMs?: number;

  /**
   * Whether to log recovery operations. Default: true
   */
  verbose?: boolean;

  /**
   * Force recovery even if locks haven't expired yet.
   * USE WITH CAUTION: May cause duplicate execution if a worker is still running.
   * Useful for development/testing when you know all workers are dead.
   * Default: false
   */
  force?: boolean;
}

const DEFAULT_CONFIG: Required<RecoveryConfig> = {
  limit: 100,
  lockExpiryBufferMs: 60000, // 1 minute buffer
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  verbose: true,
  force: false,
};

/**
 * Result from recovery operation
 */
export interface RecoveryResult {
  /** Number of orphaned executions found */
  found: number;
  /** Number successfully re-queued */
  recovered: number;
  /** Number that failed to re-queue */
  failed: number;
  /** Execution IDs that were recovered */
  recoveredIds: string[];
  /** Execution IDs that failed */
  failedIds: string[];
}

/**
 * Find and recover orphaned workflow executions.
 *
 * An execution is considered orphaned if:
 * 1. Status is 'running' (was being processed)
 * 2. Lock has expired (worker that was processing it is gone)
 * 3. Retry count is below max (still has retries left)
 * 4. Not too old (within maxAgeMs)
 *
 * @param env - Environment with database and queue access
 * @param config - Recovery configuration
 * @param authorization - Authorization token for re-queued executions
 * @returns Recovery result with counts and IDs
 */
export async function recoverOrphanedExecutions(
  env: Env,
  config: RecoveryConfig = {},
  authorization: string = "",
): Promise<RecoveryResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const { limit, lockExpiryBufferMs, maxAgeMs, verbose, force } = mergedConfig;

  await ensureTable(env, "workflow_executions");

  const now = new Date();
  const bufferTime = new Date(now.getTime() - lockExpiryBufferMs);
  const oldestAllowed = new Date(now.getTime() - maxAgeMs);

  // Find orphaned executions
  // When force=true, recover running executions regardless of lock status
  // When force=false, only recover if lock has expired (locked_until < bufferTime)
  const lockCondition = force
    ? "AND locked_until IS NOT NULL" // Any lock (force recovery)
    : "AND locked_until IS NOT NULL AND locked_until < $1"; // Expired lock only

  const orphanQuery = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT id, workflow_id, retry_count, max_retries, locked_until
      FROM workflow_executions
      WHERE status = 'running'
        ${lockCondition}
        AND retry_count < max_retries
        AND created_at > ${force ? "$1" : "$2"}
      ORDER BY created_at ASC
      LIMIT ${force ? "$2" : "$3"}
    `,
    params: force
      ? [oldestAllowed.toISOString(), limit]
      : [bufferTime.toISOString(), oldestAllowed.toISOString(), limit],
  });

  if (verbose && force) {
    console.log(
      "[RECOVERY] Force mode: recovering all running executions regardless of lock status",
    );
  }

  const orphans = (orphanQuery.result[0]?.results || []) as Array<{
    id: string;
    workflow_id: string;
    retry_count: number;
    max_retries: number;
  }>;

  if (orphans.length === 0) {
    if (verbose) {
      console.log("[RECOVERY] No orphaned executions found");
    }
    return {
      found: 0,
      recovered: 0,
      failed: 0,
      recoveredIds: [],
      failedIds: [],
    };
  }

  if (verbose) {
    console.log(`[RECOVERY] Found ${orphans.length} orphaned executions`);
  }

  const result: RecoveryResult = {
    found: orphans.length,
    recovered: 0,
    failed: 0,
    recoveredIds: [],
    failedIds: [],
  };

  // Re-queue each orphan
  for (const orphan of orphans) {
    try {
      // Clear the lock first (so executor can acquire a new one)
      await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          UPDATE workflow_executions
          SET 
            locked_at = NULL,
            locked_until = NULL,
            lock_id = NULL,
            status = 'pending',
            updated_at = $1
          WHERE id = $2
        `,
        params: [now.toISOString(), orphan.id],
      });

      // Re-queue for execution
      const message: QueueMessage = {
        executionId: orphan.id,
        retryCount: orphan.retry_count + 1,
        enqueuedAt: Date.now(),
        authorization,
      };

      await env.WORKFLOW_QUEUE.send(message);

      result.recovered++;
      result.recoveredIds.push(orphan.id);

      if (verbose) {
        console.log(
          `[RECOVERY] Re-queued execution ${orphan.id} (retry ${orphan.retry_count + 1}/${orphan.max_retries})`,
        );
      }
    } catch (error) {
      result.failed++;
      result.failedIds.push(orphan.id);

      console.error(
        `[RECOVERY] Failed to recover execution ${orphan.id}:`,
        error,
      );
    }
  }

  if (verbose) {
    console.log(
      `[RECOVERY] Complete: ${result.recovered} recovered, ${result.failed} failed`,
    );
  }

  return result;
}

/**
 * Find executions that are stuck in 'pending' status with no lock.
 * These might have been created but never queued, or the queue message was lost.
 *
 * @param env - Environment with database and queue access
 * @param config - Recovery configuration
 * @param authorization - Authorization token for re-queued executions
 * @returns Recovery result
 */
export async function recoverPendingExecutions(
  env: Env,
  config: RecoveryConfig = {},
  authorization: string = "",
): Promise<RecoveryResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const { limit, maxAgeMs, verbose, force } = mergedConfig;

  await ensureTable(env, "workflow_executions");

  const now = new Date();
  const oldestAllowed = new Date(now.getTime() - maxAgeMs);
  // Only recover if pending for at least 5 minutes (might be in queue)
  // When force=true, skip this threshold
  const stuckThreshold = force
    ? now // Recover immediately
    : new Date(now.getTime() - 5 * 60 * 1000);

  if (verbose && force) {
    console.log(
      "[RECOVERY] Force mode: recovering all pending executions immediately",
    );
  }

  const pendingQuery = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT id, workflow_id, retry_count, max_retries
      FROM workflow_executions
      WHERE status = 'pending'
        AND (locked_until IS NULL OR locked_until < $1)
        AND created_at < $2
        AND created_at > $3
        AND retry_count < max_retries
      ORDER BY created_at ASC
      LIMIT $4
    `,
    params: [
      now.toISOString(),
      stuckThreshold.toISOString(),
      oldestAllowed.toISOString(),
      limit,
    ],
  });

  const pending = (pendingQuery.result[0]?.results || []) as Array<{
    id: string;
    workflow_id: string;
    retry_count: number;
    max_retries: number;
  }>;

  if (pending.length === 0) {
    if (verbose) {
      console.log("[RECOVERY] No stuck pending executions found");
    }
    return {
      found: 0,
      recovered: 0,
      failed: 0,
      recoveredIds: [],
      failedIds: [],
    };
  }

  if (verbose) {
    console.log(`[RECOVERY] Found ${pending.length} stuck pending executions`);
  }

  const result: RecoveryResult = {
    found: pending.length,
    recovered: 0,
    failed: 0,
    recoveredIds: [],
    failedIds: [],
  };

  for (const exec of pending) {
    try {
      const message: QueueMessage = {
        executionId: exec.id,
        retryCount: exec.retry_count,
        enqueuedAt: Date.now(),
        authorization,
      };

      await env.WORKFLOW_QUEUE.send(message);

      result.recovered++;
      result.recoveredIds.push(exec.id);

      if (verbose) {
        console.log(`[RECOVERY] Queued stuck pending execution ${exec.id}`);
      }
    } catch (error) {
      result.failed++;
      result.failedIds.push(exec.id);

      console.error(`[RECOVERY] Failed to queue execution ${exec.id}:`, error);
    }
  }

  return result;
}

/**
 * Run full recovery: both orphaned (running with expired lock) and
 * stuck pending executions.
 *
 * Recommended to run this on a cron schedule (e.g., every 5 minutes).
 *
 * @param env - Environment with database and queue access
 * @param config - Recovery configuration
 * @param authorization - Authorization token for re-queued executions
 * @returns Combined recovery result
 */
export async function runFullRecovery(
  env: Env,
  config: RecoveryConfig = {},
  authorization: string = "",
): Promise<{
  orphans: RecoveryResult;
  pending: RecoveryResult;
  total: { found: number; recovered: number; failed: number };
}> {
  const orphans = await recoverOrphanedExecutions(env, config, authorization);
  const pending = await recoverPendingExecutions(env, config, authorization);

  return {
    orphans,
    pending,
    total: {
      found: orphans.found + pending.found,
      recovered: orphans.recovered + pending.recovered,
      failed: orphans.failed + pending.failed,
    },
  };
}
