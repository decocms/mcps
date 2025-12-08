export class WorkflowCancelledError extends Error {
  readonly code = "WORKFLOW_CANCELLED";

  constructor(
    public readonly executionId: string,
    message?: string,
  ) {
    super(message || `Workflow execution ${executionId} was cancelled`);
    this.name = "WorkflowCancelledError";
    Object.setPrototypeOf(this, WorkflowCancelledError.prototype);
  }
}

/**
 * Error thrown when there's a contention issue with step execution.
 * Another worker is processing the same step.
 */
export class StepContentionError extends Error {
  readonly code = "STEP_CONTENTION";

  constructor(
    public readonly executionId: string,
    public readonly stepName: string,
    message?: string,
  ) {
    super(
      message ||
        `Step ${stepName} in execution ${executionId} is being processed by another worker`,
    );
    this.name = "StepContentionError";
    Object.setPrototypeOf(this, StepContentionError.prototype);
  }
}

/**
 * Error thrown when a workflow execution is not found.
 */
export class ExecutionNotFoundError extends Error {
  readonly code = "EXECUTION_NOT_FOUND";

  constructor(
    public readonly executionId: string,
    message?: string,
  ) {
    super(message || `Workflow execution ${executionId} not found`);
    this.name = "ExecutionNotFoundError";
    Object.setPrototypeOf(this, ExecutionNotFoundError.prototype);
  }
}

/**
 * Error thrown when max retry attempts have been exceeded.
 */
export class MaxRetriesExceededError extends Error {
  readonly code = "MAX_RETRIES_EXCEEDED";

  constructor(
    public readonly executionId: string,
    public readonly retryCount: number,
    public readonly maxRetries: number,
    message?: string,
  ) {
    super(
      message ||
        `Execution ${executionId} exceeded max retries (${retryCount}/${maxRetries})`,
    );
    this.name = "MaxRetriesExceededError";
    Object.setPrototypeOf(this, MaxRetriesExceededError.prototype);
  }
}

/**
 * Error thrown when a durable sleep needs re-scheduling.
 * The workflow should be re-queued with the remaining time.
 *
 * This is a control flow mechanism, not a true error.
 * The executor catches this and returns a "sleeping" result.
 */
export class DurableSleepError extends Error {
  readonly code = "DURABLE_SLEEP";

  constructor(
    public readonly stepName: string,
    public readonly wakeAtEpochMs: number,
  ) {
    const remainingMs = Math.max(0, wakeAtEpochMs - Date.now());
    super(
      `Step '${stepName}' sleeping until ${new Date(wakeAtEpochMs).toISOString()} (${remainingMs}ms remaining)`,
    );
    this.name = "DurableSleepError";
    Object.setPrototypeOf(this, DurableSleepError.prototype);
  }

  get remainingMs(): number {
    return Math.max(0, this.wakeAtEpochMs - Date.now());
  }

  get isReady(): boolean {
    return Date.now() >= this.wakeAtEpochMs;
  }
}

/**
 * Error thrown when a step is waiting for a signal.
 *
 * This is a special "pause" error - the workflow should:
 * 1. Keep the step as "running"
 * 2. Release the execution lock
 * 3. NOT retry automatically
 *
 * The workflow will be resumed when a matching signal is sent.
 */
export class WaitingForSignalError extends Error {
  readonly code = "WAITING_FOR_SIGNAL";

  constructor(
    public readonly executionId: string,
    public readonly stepName: string,
    public readonly signalName: string,
    public readonly timeoutMs?: number,
    public readonly waitStartedAt: number = Date.now(),
  ) {
    super(`Step '${stepName}' is waiting for signal '${signalName}'`);
    this.name = "WaitingForSignalError";
    Object.setPrototypeOf(this, WaitingForSignalError.prototype);
  }

  get isTimedOut(): boolean {
    if (!this.timeoutMs) return false;
    return Date.now() - this.waitStartedAt > this.timeoutMs;
  }
}
