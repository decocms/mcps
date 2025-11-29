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
  const now = new Date().getTime();

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
      params: [JSON.stringify(output), now, now, executionId],
    });
  });

  console.log(`[DB] Marked execution ${executionId} as completed`);
}
