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
