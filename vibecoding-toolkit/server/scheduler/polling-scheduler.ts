/**
 * Polling Scheduler (Node.js / Traditional Servers)
 *
 * Uses database polling for workflow scheduling.
 * Best for long-running Node.js processes, AWS Lambda, or any environment
 * without native queue support.
 *
 * Key Features:
 * - Database-backed execution queue
 * - Adaptive polling interval (backs off when idle)
 * - Built-in orphan recovery
 * - Works with SQLite, MySQL, and PostgreSQL
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md Section 5.2
 */

import type {
  RunnableScheduler,
  ScheduleOptions,
  TickResult,
} from "./interface.ts";

/**
 * Database adapter interface for polling scheduler.
 * This abstracts away the specific database implementation.
 */
export interface PollingDatabaseAdapter {
  /**
   * Find pending executions and lock them for processing.
   * Must return only unlocked executions or those with expired locks.
   */
  findPendingExecutions(options: {
    limit: number;
    lockDurationMs: number;
    scheduledBefore?: Date;
  }): Promise<PendingExecution[]>;

  /**
   * Create a new execution record.
   */
  createExecution(
    executionId: string,
    options: {
      workflowId?: string;
      scheduledFor?: Date;
      inputs?: Record<string, unknown>;
    },
  ): Promise<void>;

  /**
   * Release a lock on an execution.
   */
  releaseLock(executionId: string, lockId: string): Promise<void>;

  /**
   * Run the workflow executor for an execution.
   */
  executeWorkflow(executionId: string): Promise<void>;
}

/**
 * Pending execution with unlock callback.
 * The unlock callback must be called after processing to release the lock.
 */
export interface PendingExecution {
  executionId: string;
  lockId: string;
  retryCount: number;
  unlock: () => Promise<void>;
}

/**
 * Polling Scheduler Configuration
 */
export interface PollingSchedulerConfig {
  /**
   * Base polling interval in milliseconds.
   * Actual interval adapts based on workload.
   * Default: 1000 (1 second)
   */
  pollIntervalMs?: number;

  /**
   * Minimum polling interval in milliseconds.
   * Used when there's work to do.
   * Default: 500 (0.5 seconds)
   */
  minPollIntervalMs?: number;

  /**
   * Maximum polling interval in milliseconds.
   * Used when idle to reduce database load.
   * Default: 30000 (30 seconds)
   */
  maxPollIntervalMs?: number;

  /**
   * How quickly to back off when idle.
   * Multiplier applied to interval when no work found.
   * Default: 1.5
   */
  backoffMultiplier?: number;

  /**
   * How quickly to speed up when busy.
   * Multiplier applied to interval when work found.
   * Default: 0.5
   */
  speedupMultiplier?: number;

  /**
   * Number of executions to process per tick.
   * Default: 10
   */
  batchSize?: number;

  /**
   * Lock duration in milliseconds.
   * How long a worker holds a lock while processing.
   * Default: 300000 (5 minutes)
   */
  lockDurationMs?: number;

  /**
   * Whether to log verbose output.
   * Default: true
   */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<PollingSchedulerConfig> = {
  pollIntervalMs: 1000,
  minPollIntervalMs: 500,
  maxPollIntervalMs: 30000,
  backoffMultiplier: 1.5,
  speedupMultiplier: 0.5,
  batchSize: 10,
  lockDurationMs: 5 * 60 * 1000,
  verbose: true,
};

/**
 * Polling-based scheduler for traditional servers.
 *
 * Pros:
 * - ✅ Works with any database (SQLite, MySQL, PostgreSQL)
 * - ✅ No external queue dependency
 * - ✅ Built-in orphan recovery
 * - ✅ Adaptive polling reduces idle load
 *
 * Cons:
 * - ❌ Requires long-running process
 * - ❌ Slightly higher latency than queue-based
 * - ❌ More database load than queue-based
 */
export class PollingScheduler implements RunnableScheduler {
  private running = false;
  private pollTimeoutId?: ReturnType<typeof setTimeout>;
  private currentIntervalMs: number;
  private config: Required<PollingSchedulerConfig>;

  constructor(
    private db: PollingDatabaseAdapter,
    config: PollingSchedulerConfig = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentIntervalMs = this.config.pollIntervalMs;
  }

  /**
   * Start the background polling loop.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn("[POLLING] Scheduler already running");
      return;
    }

    this.running = true;
    this.currentIntervalMs = this.config.pollIntervalMs;

    if (this.config.verbose) {
      console.log("[POLLING] Starting scheduler");
    }

    // Start polling loop
    this.poll();
  }

  /**
   * Stop the background polling loop.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = undefined;
    }

    if (this.config.verbose) {
      console.log("[POLLING] Scheduler stopped");
    }
  }

  /**
   * Check if the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Process pending executions.
   * Called automatically by the polling loop, or manually for cron triggers.
   */
  async tick(): Promise<TickResult> {
    const { batchSize, lockDurationMs, verbose } = this.config;

    try {
      // Find pending executions with lock
      const pending = await this.db.findPendingExecutions({
        limit: batchSize,
        lockDurationMs,
        scheduledBefore: new Date(),
      });

      if (pending.length === 0) {
        return { processed: 0 };
      }

      if (verbose) {
        console.log(`[POLLING] Processing ${pending.length} executions`);
      }

      let processed = 0;
      let errors = 0;

      // Process each execution
      for (const { executionId, unlock } of pending) {
        try {
          await this.db.executeWorkflow(executionId);
          processed++;
        } catch (error) {
          errors++;
          console.error(`[POLLING] Error executing ${executionId}:`, error);
        } finally {
          // Always release lock
          await unlock().catch((e) => {
            console.warn(`[POLLING] Failed to unlock ${executionId}:`, e);
          });
        }
      }

      if (verbose) {
        console.log(
          `[POLLING] Tick complete: ${processed} processed, ${errors} errors`,
        );
      }

      return { processed, errors: errors > 0 ? errors : undefined };
    } catch (error) {
      console.error("[POLLING] Tick error:", error);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Schedule an execution.
   * Creates a record in the database that will be picked up by the polling loop.
   */
  async schedule(
    executionId: string,
    options?: ScheduleOptions,
  ): Promise<void> {
    await this.db.createExecution(executionId, {
      scheduledFor: options?.runAt,
    });

    if (this.config.verbose) {
      const when = options?.runAt
        ? `at ${options.runAt.toISOString()}`
        : "immediately";
      console.log(`[POLLING] Scheduled execution ${executionId} ${when}`);
    }
  }

  /**
   * Cancel a scheduled execution.
   * For polling scheduler, this would mark the execution as cancelled in the database.
   * The tick() loop will skip cancelled executions.
   */
  async cancel?(executionId: string): Promise<void> {
    // Note: Cancellation should be implemented in the database adapter
    // by setting the execution status to 'cancelled'
    console.log(
      `[POLLING] Cancel requested for ${executionId} (implement in db adapter)`,
    );
  }

  /**
   * Internal polling loop with adaptive interval.
   */
  private poll(): void {
    if (!this.running) return;

    this.tick()
      .then((result) => {
        // Adapt polling interval based on workload
        if (result.processed > 0) {
          // Work found - speed up
          this.currentIntervalMs = Math.max(
            this.config.minPollIntervalMs,
            this.currentIntervalMs * this.config.speedupMultiplier,
          );
        } else {
          // No work - back off
          this.currentIntervalMs = Math.min(
            this.config.maxPollIntervalMs,
            this.currentIntervalMs * this.config.backoffMultiplier,
          );
        }
      })
      .catch((error) => {
        console.error("[POLLING] Poll error:", error);
        // Back off on error
        this.currentIntervalMs = Math.min(
          this.config.maxPollIntervalMs,
          this.currentIntervalMs * 2,
        );
      })
      .finally(() => {
        // Schedule next poll
        if (this.running) {
          this.pollTimeoutId = setTimeout(
            () => this.poll(),
            this.currentIntervalMs,
          );
        }
      });
  }
}

/**
 * Create a polling scheduler instance.
 *
 * @param db - Database adapter
 * @param config - Optional configuration
 * @returns PollingScheduler instance
 */
export function createPollingScheduler(
  db: PollingDatabaseAdapter,
  config?: PollingSchedulerConfig,
): PollingScheduler {
  return new PollingScheduler(db, config);
}
