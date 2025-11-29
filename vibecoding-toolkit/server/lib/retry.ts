/**
 * Retry Logic with Exponential Backoff
 *
 * Implements retry patterns for durable workflow execution including:
 * - Exponential backoff with jitter
 * - Retryable error detection
 * - Per-step and workflow-level retry configuration
 *
 * @see docs/WORKFLOW_EXECUTION_DESIGN.md Section 4.4
 * @see docs/DURABLE_PATTERNS.md Section 3
 * @see docs/DBOS_PATTERNS.md Section 5
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
 * Check if we should continue retrying.
 *
 * @param retryCount - Current retry count (0-indexed)
 * @param error - The error that occurred
 * @param config - Retry configuration
 * @returns RetryDecision with retry status and delay
 */
export function shouldRetry(
  retryCount: number,
  error: unknown,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): RetryDecision {
  if (retryCount >= config.maxRetries) {
    return {
      retry: false,
      reason: `Max retries (${config.maxRetries}) exceeded`,
    };
  }

  if (!isRetryableError(error)) {
    return {
      retry: false,
      reason: `Non-retryable error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    retry: true,
    delaySeconds: calculateBackoff(retryCount, config),
  };
}

/**
 * Check if a step should retry based on step-level configuration.
 *
 * @param attemptCount - Current attempt count (1-indexed)
 * @param error - The error that occurred
 * @param config - Step retry configuration
 * @returns RetryDecision with retry status and delay
 */
export function shouldStepRetry(
  attemptCount: number,
  error: unknown,
  config: StepRetryConfig = {},
): RetryDecision {
  const {
    retriesAllowed = DEFAULT_STEP_RETRY_CONFIG.retriesAllowed,
    maxAttempts = DEFAULT_STEP_RETRY_CONFIG.maxAttempts,
  } = config;

  if (!retriesAllowed) {
    return {
      retry: false,
      reason: "Retries not allowed for this step",
    };
  }

  if (attemptCount >= maxAttempts) {
    return {
      retry: false,
      reason: `Max step attempts (${maxAttempts}) exceeded`,
    };
  }

  if (!isRetryableError(error)) {
    return {
      retry: false,
      reason: `Non-retryable error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    retry: true,
    delaySeconds: calculateStepBackoff(attemptCount, config),
  };
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const decision = shouldRetry(attempt, error, config);

      if (!decision.retry) {
        throw error;
      }

      console.log(
        `[RETRY] Attempt ${attempt + 1} failed, retrying in ${decision.delaySeconds}s: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      await sleep(decision.delaySeconds! * 1000);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an AbortController that times out after a duration.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Execute a function with a timeout.
 *
 * @param fn - Function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutMessage - Message for timeout error
 * @returns Result of the function
 * @throws TimeoutError if the function takes too long
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = "Operation timed out",
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
}
