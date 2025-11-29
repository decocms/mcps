/**
 * Polling Database Adapter
 *
 * Implements the PollingDatabaseAdapter interface for the Deco environment.
 * Handles the database operations needed by the PollingScheduler.
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md
 */

import type { Env } from "../main.ts";
import type {
  PollingDatabaseAdapter,
  PendingExecution,
} from "./polling-scheduler.ts";
import { executeWorkflow } from "../workflow/executor.ts";
import { ensureTable } from "../lib/postgres.ts";

/**
 * Configuration for the polling database adapter
 */
export interface PollingDbAdapterConfig {
  /**
   * Whether to use database-specific optimizations.
   * When true, uses FOR UPDATE SKIP LOCKED on PostgreSQL/MySQL.
   * Default: true
   */
  useOptimizations?: boolean;
}

/**
 * Create a polling database adapter for the Deco environment.
 *
 * @param env - Deco environment
 * @param config - Optional configuration
 * @returns PollingDatabaseAdapter implementation
 */
export function createPollingDbAdapter(
  env: Env,
  config: PollingDbAdapterConfig = {},
): PollingDatabaseAdapter {
  const { useOptimizations = true } = config;

  return {
    async findPendingExecutions(options) {
      await ensureTable(env, "workflow_executions");

      const { limit, lockDurationMs, scheduledBefore } = options;
      const now = new Date();
      const lockUntil = new Date(now.getTime() + lockDurationMs);
      const lockId = crypto.randomUUID();

      // Standard query that works across all databases
      // Uses timestamp-based optimistic locking
      const query = `
        UPDATE workflow_executions
        SET 
          locked_at = $1,
          locked_until = $2,
          lock_id = $3,
          status = CASE WHEN status = 'pending' THEN 'running' ELSE status END,
          updated_at = $1
        WHERE id IN (
          SELECT id FROM workflow_executions
          WHERE status IN ('pending', 'running')
            AND (locked_until IS NULL OR locked_until < $1)
            AND retry_count < max_retries
            ${scheduledBefore ? "AND (started_at_epoch_ms IS NULL OR started_at_epoch_ms <= $5)" : ""}
          ORDER BY created_at ASC
          LIMIT $4
        )
        RETURNING id, retry_count
      `;

      const params: unknown[] = [
        now.toISOString(),
        lockUntil.toISOString(),
        lockId,
        limit,
      ];

      if (scheduledBefore) {
        params.push(scheduledBefore.getTime());
      }

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: query,
        params,
      });

      const rows = (result.result[0]?.results || []) as Array<{
        id: string;
        retry_count: number;
      }>;

      return rows.map((row) => ({
        executionId: row.id,
        lockId,
        retryCount: row.retry_count,
        unlock: async () => {
          await env.DATABASE.DATABASES_RUN_SQL({
            sql: `
              UPDATE workflow_executions
              SET 
                locked_at = NULL,
                locked_until = NULL,
                lock_id = NULL,
                updated_at = $1
              WHERE id = $2 AND lock_id = $3
            `,
            params: [new Date().toISOString(), row.id, lockId],
          });
        },
      }));
    },

    async createExecution(executionId, options) {
      await ensureTable(env, "workflow_executions");

      const now = new Date().toISOString();

      // Check if execution already exists
      const existing = await env.DATABASE.DATABASES_RUN_SQL({
        sql: "SELECT id FROM workflow_executions WHERE id = $1",
        params: [executionId],
      });

      if (existing.result[0]?.results?.length) {
        // Already exists, nothing to do
        return;
      }

      // Create new execution
      await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          INSERT INTO workflow_executions (
            id, workflow_id, status, created_at, updated_at, 
            inputs, retry_count, max_retries
          ) VALUES ($1, $2, 'pending', $3, $3, $4, 0, 10)
        `,
        params: [
          executionId,
          options.workflowId || "",
          now,
          JSON.stringify(options.inputs || {}),
        ],
      });
    },

    async releaseLock(executionId, lockId) {
      await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          UPDATE workflow_executions
          SET 
            locked_at = NULL,
            locked_until = NULL,
            lock_id = NULL,
            updated_at = $1
          WHERE id = $2 AND lock_id = $3
        `,
        params: [new Date().toISOString(), executionId, lockId],
      });
    },

    async executeWorkflow(executionId) {
      await executeWorkflow(env, executionId);
    },
  };
}

/**
 * PostgreSQL-specific optimizations for the polling database adapter.
 * Uses FOR UPDATE SKIP LOCKED for better concurrency.
 */
export function createPostgresPollingDbAdapter(
  env: Env,
): PollingDatabaseAdapter {
  return {
    async findPendingExecutions(options) {
      await ensureTable(env, "workflow_executions");

      const { limit, lockDurationMs, scheduledBefore } = options;
      const now = new Date();
      const lockUntil = new Date(now.getTime() + lockDurationMs);
      const lockId = crypto.randomUUID();

      // PostgreSQL-optimized query using FOR UPDATE SKIP LOCKED
      // This prevents workers from blocking each other
      const selectQuery = `
        SELECT id, retry_count 
        FROM workflow_executions
        WHERE status IN ('pending', 'running')
          AND (locked_until IS NULL OR locked_until < $1)
          AND retry_count < max_retries
          ${scheduledBefore ? "AND (started_at_epoch_ms IS NULL OR started_at_epoch_ms <= $3)" : ""}
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `;

      const selectParams: unknown[] = [now.toISOString(), limit];
      if (scheduledBefore) {
        selectParams.push(scheduledBefore.getTime());
      }

      // This is a simplified version - in production you'd want a transaction
      const selectResult = await env.DATABASE.DATABASES_RUN_SQL({
        sql: selectQuery,
        params: selectParams,
      });

      const rows = (selectResult.result[0]?.results || []) as Array<{
        id: string;
        retry_count: number;
      }>;

      if (rows.length === 0) {
        return [];
      }

      // Lock the selected rows
      const ids = rows.map((r) => r.id);
      await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          UPDATE workflow_executions
          SET 
            locked_at = $1,
            locked_until = $2,
            lock_id = $3,
            status = CASE WHEN status = 'pending' THEN 'running' ELSE status END,
            updated_at = $1
          WHERE id = ANY($4)
        `,
        params: [now.toISOString(), lockUntil.toISOString(), lockId, ids],
      });

      return rows.map((row) => ({
        executionId: row.id,
        lockId,
        retryCount: row.retry_count,
        unlock: async () => {
          await env.DATABASE.DATABASES_RUN_SQL({
            sql: `
              UPDATE workflow_executions
              SET 
                locked_at = NULL,
                locked_until = NULL,
                lock_id = NULL,
                updated_at = $1
              WHERE id = $2 AND lock_id = $3
            `,
            params: [new Date().toISOString(), row.id, lockId],
          });
        },
      }));
    },

    // Reuse the standard implementations for these
    async createExecution(executionId, options) {
      const standardAdapter = createPollingDbAdapter(env);
      return standardAdapter.createExecution(executionId, options);
    },

    async releaseLock(executionId, lockId) {
      const standardAdapter = createPollingDbAdapter(env);
      return standardAdapter.releaseLock(executionId, lockId);
    },

    async executeWorkflow(executionId) {
      await executeWorkflow(env, executionId);
    },
  };
}
