/**
 * Workflow Scheduler Interfaces
 *
 * Defines the pluggable scheduler interfaces for workflow execution.
 * Supports multiple runtimes: Cloudflare Workers, Node.js, AWS Lambda, etc.
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md
 */

/**
 * Schedule options for workflow execution
 */
export interface ScheduleOptions {
  /**
   * When to run the execution.
   * If undefined, run as soon as possible.
   */
  runAt?: Date;

  /**
   * Authorization token for the execution context.
   * Captured at schedule time, used at execution time.
   */
  authorization?: string;
}

/**
 * Result from a tick operation
 */
export interface TickResult {
  /** Number of executions processed */
  processed: number;
  /** Number of errors encountered */
  errors?: number;
}

/**
 * Minimal interface for scheduling workflow executions.
 *
 * The scheduler's job:
 * 1. Accept a request to run an execution (now or later)
 * 2. Ensure the execution gets processed (somehow)
 *
 * Implementations:
 * - QueueScheduler: Cloudflare Queues
 * - PollingScheduler: Database polling loop
 * - HttpScheduler: External cron triggers
 */
export interface WorkflowScheduler {
  /**
   * Schedule an execution to run.
   *
   * @param executionId - The execution to run
   * @param options - Schedule options (runAt, authorization)
   * @returns Promise that resolves when scheduling is complete
   */
  schedule(executionId: string, options?: ScheduleOptions): Promise<void>;

  /**
   * Cancel a scheduled execution (optional).
   * Some schedulers may not support cancellation.
   *
   * @param executionId - The execution to cancel
   */
  cancel?(executionId: string): Promise<void>;
}

/**
 * For schedulers that need external triggering.
 *
 * Examples: cron jobs, manual endpoints, Lambda functions.
 * The `tick()` method is called periodically to process pending executions.
 */
export interface TickableScheduler extends WorkflowScheduler {
  /**
   * Process any pending executions.
   * Called by: cron trigger, HTTP endpoint, polling loop.
   *
   * @returns Number of executions processed and errors encountered
   */
  tick(): Promise<TickResult>;
}

/**
 * For schedulers with persistent background processes.
 *
 * Examples: long-running Node.js servers, worker processes.
 * These schedulers can run a background loop to process executions.
 */
export interface RunnableScheduler extends TickableScheduler {
  /**
   * Start the background scheduler.
   * This may start a polling loop, connect to DB notifications, etc.
   */
  start(): Promise<void>;

  /**
   * Stop the background scheduler.
   * Clean up resources, close connections, stop loops.
   */
  stop(): Promise<void>;

  /**
   * Check if the scheduler is currently running.
   */
  isRunning(): boolean;
}

/**
 * Type guard to check if a scheduler is tickable
 */
export function isTickableScheduler(
  scheduler: WorkflowScheduler,
): scheduler is TickableScheduler {
  return "tick" in scheduler && typeof scheduler.tick === "function";
}

/**
 * Type guard to check if a scheduler is runnable
 */
export function isRunnableScheduler(
  scheduler: WorkflowScheduler,
): scheduler is RunnableScheduler {
  return (
    isTickableScheduler(scheduler) &&
    "start" in scheduler &&
    "stop" in scheduler &&
    "isRunning" in scheduler
  );
}

