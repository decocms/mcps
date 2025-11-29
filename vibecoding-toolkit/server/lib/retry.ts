/**
 * Retry Logic with Exponential Backoff
 *
 * Implements retry patterns for durable workflow execution including:
 * - Exponential backoff with jitter
 * - Retryable error detection
 * - Per-step and workflow-level retry configuration
 *
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in seconds for exponential backoff */
  baseDelaySeconds: number;
  /** Maximum delay in seconds (cap for exponential growth) */
  maxDelaySeconds: number;
  /** Maximum jitter in seconds to add randomness */
  jitterSeconds: number;
}

/**
 * Per-step retry configuration (from DBOS patterns)
 */
export interface StepRetryConfig {
  /** Whether retries are allowed for this step. Default: true */
  retriesAllowed?: boolean;
  /** Initial retry delay in seconds. Default: 1 */
  intervalSeconds?: number;
  /** Maximum retry attempts for this step. Default: 3 */
  maxAttempts?: number;
  /** Backoff multiplier. Default: 2 */
  backoffRate?: number;
  /** Step execution timeout in seconds. Default: none */
  timeoutSeconds?: number;
}

/**
 * Result of a retry decision
 */
export interface RetryDecision {
  /** Whether to retry */
  retry: boolean;
  /** Delay in seconds before retry (if retrying) */
  delaySeconds?: number;
  /** Reason for the decision */
  reason?: string;
}

/**
 * Default retry configuration
 *
 * Retry sequence with defaults:
 * Retry 0: ~2-5s
 * Retry 1: ~4-7s
 * Retry 2: ~8-11s
 * Retry 3: ~16-19s
 * Retry 4: ~32-35s
 * Retry 5: ~64-67s
 * Retry 6: ~128-131s
 * Retry 7: ~256-259s
 * Retry 8+: ~300s (capped)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 10,
  baseDelaySeconds: 2,
  maxDelaySeconds: 300, // 5 minutes
  jitterSeconds: 3,
};

/**
 * Default step retry configuration (from DBOS patterns)
 */
export const DEFAULT_STEP_RETRY_CONFIG: Required<StepRetryConfig> = {
  retriesAllowed: true,
  intervalSeconds: 1,
  maxAttempts: 3,
  backoffRate: 2,
  timeoutSeconds: 60,
};

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Formula: min(base * 2^retryCount + jitter, max)
 *
 * @param retryCount - Current retry attempt (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in seconds
 */
export function calculateBackoff(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const { baseDelaySeconds, maxDelaySeconds, jitterSeconds } = config;

  // Exponential: base * 2^retryCount
  const exponentialDelay = Math.pow(2, retryCount) * baseDelaySeconds;

  // Random jitter: 0 to jitterSeconds
  const jitter = Math.floor(Math.random() * (jitterSeconds + 1));

  // Cap at maximum
  return Math.min(exponentialDelay + jitter, maxDelaySeconds);
}

/**
 * Calculate step-level backoff using StepRetryConfig
 *
 * @param attemptCount - Current attempt (1-indexed)
 * @param config - Step retry configuration
 * @returns Delay in seconds
 */
export function calculateStepBackoff(
  attemptCount: number,
  config: StepRetryConfig = {},
): number {
  const {
    intervalSeconds = DEFAULT_STEP_RETRY_CONFIG.intervalSeconds,
    backoffRate = DEFAULT_STEP_RETRY_CONFIG.backoffRate,
  } = config;

  // attemptCount is 1-indexed, convert to 0-indexed for calculation
  const retryIndex = Math.max(0, attemptCount - 1);

  // Exponential: interval * backoffRate^retryIndex
  const delay = intervalSeconds * Math.pow(backoffRate, retryIndex);

  // Add jitter (0.5 to 1.0 multiplier)
  const jitter = 0.5 + Math.random() * 0.5;

  return delay * jitter;
}

/**
 * Determine if an error is retryable based on error type/message.
 *
 * Retryable errors:
 * - Network errors (timeout, connection reset, refused)
 * - Lock contention
 * - Rate limiting (429)
 * - Server errors (5xx)
 *
 * Non-retryable errors:
 * - Validation errors
 * - Authentication errors
 * - Client errors (4xx except 429)
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network/transient errors - retry
    if (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("fetch failed")
    ) {
      return true;
    }

    // Lock contention - retry
    if (message.includes("locked")) {
      return true;
    }

    // Rate limiting - retry
    if (message.includes("rate limit") || message.includes("429")) {
      return true;
    }

    // Server errors - retry
    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504") ||
      message.includes("internal server error") ||
      message.includes("bad gateway") ||
      message.includes("service unavailable") ||
      message.includes("gateway timeout")
    ) {
      return true;
    }

    // Database errors that might be transient - retry
    if (
      message.includes("connection") ||
      message.includes("busy") || // SQLite
      message.includes("database is locked") // SQLite
    ) {
      return true;
    }
  }

  // Check for HTTP response objects
  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const status = errorObj.status || errorObj.statusCode;

    if (typeof status === "number") {
      // Rate limit - retry
      if (status === 429) return true;
      // Server errors - retry
      if (status >= 500 && status < 600) return true;
    }
  }

  // Default: don't retry (validation errors, auth errors, etc.)
  return false;
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
