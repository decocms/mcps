/**
 * Database Utility Functions with Retry
 *
 * Provides database-agnostic utilities for workflow execution including:
 * - Automatic retry for transient database errors
 * - Error tracking for executions
 * - Retry count tracking (zero on success, increment on failure)
 *
 * @see docs/WORKFLOW_EXECUTION_DESIGN.md Section 10
 * @see docs/DBOS_PATTERNS.md Section 5 (Database Retry Decorator)
 * @see docs/DURABLE_PATTERNS.md Pattern #3 & #6
 */

import type { Env } from "../main.ts";
import { sleep } from "./retry.ts";

/**
 * Configuration for database retry behavior
 */
export interface DbRetryConfig {
  /** Maximum number of retry attempts. Default: 5 */
  maxRetries?: number;
  /** Initial backoff in milliseconds. Default: 1000 */
  initialBackoffMs?: number;
  /** Maximum backoff in milliseconds. Default: 60000 */
  maxBackoffMs?: number;
}

const DEFAULT_DB_RETRY_CONFIG: Required<DbRetryConfig> = {
  maxRetries: 5,
  initialBackoffMs: 1000,
  maxBackoffMs: 60000,
};

/**
 * Check if an error is a retryable database error.
 *
 * Database-specific retryable errors:
 * - Connection issues
 * - Timeouts
 * - SQLite BUSY/LOCKED
 * - PostgreSQL connection class errors (08xxx)
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableDbError(error: unknown): boolean {
  const message = String(error).toLowerCase();

  return (
    // Connection errors
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    // SQLite specific
    message.includes("busy") ||
    message.includes("locked") ||
    message.includes("database is locked") ||
    // PostgreSQL specific
    message.includes("connection terminated") ||
    message.includes("connection refused") ||
    // Generic network
    message.includes("network") ||
    message.includes("socket")
  );
}

/**
 * Execute a database operation with automatic retry on transient errors.
 *
 * Uses exponential backoff with jitter as recommended in DBOS patterns.
 *
 * @param operation - The database operation to execute
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  config: DbRetryConfig = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_DB_RETRY_CONFIG.maxRetries,
    initialBackoffMs = DEFAULT_DB_RETRY_CONFIG.initialBackoffMs,
    maxBackoffMs = DEFAULT_DB_RETRY_CONFIG.maxBackoffMs,
  } = config;

  let backoff = initialBackoffMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableDbError(error) || attempt === maxRetries) {
        throw error;
      }

      // Jitter: 0.5 to 1.0 multiplier
      const jitter = 0.5 + Math.random() * 0.5;
      const actualBackoff = backoff * jitter;

      console.log(
        `[DB_RETRY] Attempt ${attempt + 1} failed, retrying in ${Math.round(actualBackoff)}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      await sleep(actualBackoff);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    }
  }

  throw lastError;
}

/**
 * Track an execution error in the database.
 *
 * Updates the workflow_executions table with error information
 * and increments the retry count.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param error - The error that occurred
 * @param retryCount - Current retry count
 */
export async function trackExecutionError(
  env: Env,
  executionId: string,
  error: unknown,
  retryCount: number,
): Promise<void> {
  try {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          retry_count = $1,
          last_error = $2,
          last_retry_at = $3,
          updated_at = $3
        WHERE id = $4
      `,
      params: [
        retryCount,
        error instanceof Error ? error.message : String(error),
        new Date().toISOString(),
        executionId,
      ],
    });
  } catch (trackError) {
    // Don't throw - error tracking is best-effort
    console.error(`[DB] Failed to track error for ${executionId}:`, trackError);
  }
}

/**
 * Mark an execution as failed.
 *
 * Sets the status to 'failed' and records the error.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param error - The error that caused the failure
 */
export async function markExecutionFailed(
  env: Env,
  executionId: string,
  error: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);

  await withDbRetry(async () => {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          status = 'failed',
          last_error = $1,
          updated_at = $2,
          completed_at_epoch_ms = $3
        WHERE id = $4
      `,
      params: [errorMessage, now, Date.now(), executionId],
    });
  });

  console.log(
    `[DB] Marked execution ${executionId} as failed: ${errorMessage}`,
  );
}

/**
 * Mark an execution as completed.
 *
 * Sets the status to 'completed' and stores the output.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param output - The final output of the workflow
 */
export async function markExecutionCompleted(
  env: Env,
  executionId: string,
  output: unknown,
): Promise<void> {
  const now = new Date().toISOString();

  await withDbRetry(async () => {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          status = 'completed',
          output = $1,
          updated_at = $2,
          completed_at_epoch_ms = $3
        WHERE id = $4
      `,
      params: [JSON.stringify(output), now, Date.now(), executionId],
    });
  });

  console.log(`[DB] Marked execution ${executionId} as completed`);
}

/**
 * Persist a step result atomically.
 *
 * Updates both the step result and the execution record in one operation.
 * Uses batch SQL to ensure atomicity.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param stepId - The step ID
 * @param result - The step result
 */
export async function persistStepResult(
  env: Env,
  executionId: string,
  stepId: string,
  result: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const nowMs = Date.now();

  await withDbRetry(async () => {
    // Update step result
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE execution_step_results 
        SET 
          output = $1, 
          completed_at_epoch_ms = $2
        WHERE execution_id = $3 AND step_id = $4
      `,
      params: [JSON.stringify(result), nowMs, executionId, stepId],
    });

    // Update execution timestamp
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions
        SET updated_at = $1
        WHERE id = $2
      `,
      params: [now, executionId],
    });
  });

  console.log(`[DB] Persisted step result for ${executionId}/${stepId}`);
}

/**
 * Track step-level error and attempt count.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @param stepId - The step ID
 * @param error - The error that occurred
 * @param attemptCount - Current attempt count for this step
 */
export async function trackStepError(
  env: Env,
  executionId: string,
  stepId: string,
  error: unknown,
  attemptCount: number,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  try {
    // Try to get existing errors
    const existing = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        SELECT errors FROM execution_step_results
        WHERE execution_id = $1 AND step_id = $2
      `,
      params: [executionId, stepId],
    });

    const row = existing.result[0]?.results?.[0] as
      | { errors?: string }
      | undefined;
    let errors: Array<{ message: string; timestamp: string; attempt: number }> =
      [];

    if (row?.errors) {
      try {
        errors = JSON.parse(row.errors);
      } catch {
        errors = [];
      }
    }

    // Add new error
    errors.push({
      message: errorMessage,
      timestamp: new Date().toISOString(),
      attempt: attemptCount,
    });

    // Update step with error and attempt count
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE execution_step_results 
        SET 
          attempt_count = $1,
          error = $2,
          errors = $3
        WHERE execution_id = $4 AND step_id = $5
      `,
      params: [
        attemptCount,
        errorMessage,
        JSON.stringify(errors),
        executionId,
        stepId,
      ],
    });
  } catch (trackError) {
    console.error(
      `[DB] Failed to track step error for ${executionId}/${stepId}:`,
      trackError,
    );
  }
}

/**
 * Create structured log entry for workflow operations.
 *
 * @param operation - The operation being performed
 * @param data - Log data
 */
export function logWorkflowOperation(
  operation: "start" | "step" | "complete" | "fail" | "retry",
  data: {
    executionId: string;
    stepId?: string;
    retryCount?: number;
    duration?: number;
    error?: string;
    status?: string;
  },
): void {
  const log = {
    operation,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log("[WORKFLOW]", JSON.stringify(log));
}

// ============================================================================
// Retry Tracking (Pattern #3 & #6 from durable package)
// ============================================================================

/**
 * Zero retries atomically (Pattern #6 from durable package).
 *
 * Resets the retry count to 0 and clears the last error.
 * Called after successful execution to ensure clean state.
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 */
export async function zeroRetries(
  env: Env,
  executionId: string,
): Promise<void> {
  await withDbRetry(async () => {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          retry_count = 0,
          last_error = NULL,
          updated_at = $1
        WHERE id = $2
      `,
      params: [new Date().toISOString(), executionId],
    });
  });
}

/**
 * Increment retry count atomically (Pattern #3 from durable package).
 *
 * @param env - Environment with database access
 * @param executionId - The workflow execution ID
 * @returns New retry count
 */
export async function incrementRetries(
  env: Env,
  executionId: string,
): Promise<number> {
  const result = await withDbRetry(async () => {
    return env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          retry_count = retry_count + 1,
          updated_at = $1
        WHERE id = $2
        RETURNING retry_count
      `,
      params: [new Date().toISOString(), executionId],
    });
  });

  const row = result.result[0]?.results?.[0] as
    | { retry_count: number }
    | undefined;
  return row?.retry_count ?? 0;
}
