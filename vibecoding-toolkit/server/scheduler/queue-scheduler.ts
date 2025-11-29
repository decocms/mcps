/**
 * Queue Scheduler (Cloudflare Workers)
 *
 * Uses Cloudflare Queues for workflow scheduling.
 * Best for immediate to medium-term scheduling (up to 7 days).
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md Section 5.1
 */

import type { Queue } from "@cloudflare/workers-types";
import type { QueueMessage } from "../collections/workflow.ts";
import type { WorkflowScheduler, ScheduleOptions } from "./interface.ts";

/**
 * Maximum delay supported by Cloudflare Queues (7 days in seconds)
 */
const MAX_QUEUE_DELAY_SECONDS = 7 * 24 * 60 * 60; // 604800

/**
 * Queue Scheduler Configuration
 */
export interface QueueSchedulerConfig {
  /**
   * Optional default authorization token.
   * Used when schedule() is called without an authorization option.
   */
  defaultAuthorization?: string;
}

/**
 * Queue-based scheduler for Cloudflare Workers.
 *
 * Pros:
 * - ✅ Immediate execution (<1s latency)
 * - ✅ Built-in retry with exponential backoff
 * - ✅ High throughput, low latency
 * - ✅ No background process needed
 *
 * Cons:
 * - ❌ Max 7-day scheduling horizon
 * - ❌ CF Workers-specific
 * - ❌ No orphan recovery
 * - ❌ Can't cancel scheduled messages
 */
export class QueueScheduler implements WorkflowScheduler {
  constructor(
    private queue: Queue<QueueMessage>,
    private config: QueueSchedulerConfig = {},
  ) {}

  /**
   * Schedule an execution via Cloudflare Queue.
   *
   * @param executionId - The execution ID to schedule
   * @param options - Schedule options
   * @throws Error if the requested delay exceeds 7 days
   */
  async schedule(
    executionId: string,
    options?: ScheduleOptions,
  ): Promise<void> {
    const delaySeconds = options?.runAt
      ? Math.max(0, Math.floor((options.runAt.getTime() - Date.now()) / 1000))
      : 0;

    // Check max delay
    if (delaySeconds > MAX_QUEUE_DELAY_SECONDS) {
      throw new Error(
        `Queue scheduler max delay is 7 days (${MAX_QUEUE_DELAY_SECONDS}s). ` +
          `Requested: ${delaySeconds}s (${options?.runAt?.toISOString()})`,
      );
    }

    const message: QueueMessage = {
      executionId,
      retryCount: 0,
      enqueuedAt: Date.now(),
      authorization: options?.authorization ?? this.config.defaultAuthorization ?? "",
    };

    await this.queue.send(
      message,
      delaySeconds > 0 ? { delaySeconds } : undefined,
    );
  }

  /**
   * Cancel is not supported by queue scheduler.
   * Once a message is queued, it cannot be cancelled.
   *
   * To "cancel" an execution, mark it as cancelled in the database.
   * The executor will check status and skip cancelled executions.
   */
  cancel?(_executionId: string): Promise<void> {
    throw new Error(
      "QueueScheduler does not support cancel. " +
        "Mark the execution as 'cancelled' in the database instead.",
    );
  }
}

/**
 * Create a queue scheduler instance.
 *
 * @param queue - Cloudflare Queue binding
 * @param config - Optional configuration
 * @returns QueueScheduler instance
 */
export function createQueueScheduler(
  queue: Queue<QueueMessage>,
  config?: QueueSchedulerConfig,
): QueueScheduler {
  return new QueueScheduler(queue, config);
}

