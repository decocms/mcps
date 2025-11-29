/**
 * Library Index
 *
 * Re-exports all library utilities for convenient importing.
 *
 * Usage:
 * ```typescript
 * import { acquireLock, releaseLock, withRetry, trackExecutionError } from "./lib";
 * ```
 */

// Workflow locking utilities
export {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
  withLock,
  type LockResult,
  type LockConfig,
} from "./workflow-lock.ts";

// Retry utilities
export {
  calculateBackoff,
  calculateStepBackoff,
  isRetryableError,
  sleep,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_STEP_RETRY_CONFIG,
  type RetryConfig,
  type StepRetryConfig,
  type RetryDecision,
} from "./retry.ts";

// Database utilities
export {
  isRetryableDbError,
  withDbRetry,
  markExecutionCompleted,
  type DbRetryConfig,
} from "../workflow/db-utils.ts";

// Orphan recovery utilities (for serverless cron jobs)
export {
  recoverOrphanedExecutions,
  recoverPendingExecutions,
  runFullRecovery,
  type RecoveryConfig,
  type RecoveryResult,
} from "./orphan-recovery.ts";
