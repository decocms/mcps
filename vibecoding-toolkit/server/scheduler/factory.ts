/**
 * Scheduler Factory
 *
 * Creates workflow schedulers based on runtime and configuration.
 * Supports multiple scheduler types for different deployment environments.
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md Section 6.1
 */

import type { Queue } from "@cloudflare/workers-types";
import type { QueueMessage } from "../collections/workflow.ts";
import type { WorkflowScheduler } from "./interface.ts";
import { QueueScheduler } from "./queue-scheduler.ts";
import {
  PollingScheduler,
  type PollingDatabaseAdapter,
  type PollingSchedulerConfig,
} from "./polling-scheduler.ts";

/**
 * Supported scheduler types
 */
export type SchedulerType =
  | "queue" // Cloudflare Workers Queue (serverless)
  | "polling"; // Long-running process with polling loop (traditional servers)

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Scheduler type */
  type: SchedulerType;

  // Queue scheduler config
  /** Cloudflare Queue binding (required for 'queue' type) */
  queue?: Queue<QueueMessage>;

  // Polling scheduler config
  /** Database adapter (required for 'polling' type) */
  dbAdapter?: PollingDatabaseAdapter;
  /** Polling scheduler options */
  pollingConfig?: PollingSchedulerConfig;

  // Common config
  /** Default authorization token */
  defaultAuthorization?: string;
}

/**
 * Create a workflow scheduler based on configuration.
 *
 * @param config - Scheduler configuration
 * @returns Configured scheduler instance
 * @throws Error if required configuration is missing
 *
 * @example
 * // Cloudflare Workers with Queue (serverless)
 * const scheduler = createScheduler({
 *   type: 'queue',
 *   queue: env.WORKFLOW_QUEUE,
 * });
 *
 * @example
 * // Node.js with Polling (traditional servers)
 * const dbAdapter = createPollingDbAdapter(env);
 * const scheduler = createScheduler({
 *   type: 'polling',
 *   dbAdapter,
 *   pollingConfig: {
 *     pollIntervalMs: 1000,
 *     batchSize: 10,
 *   },
 * });
 * await scheduler.start(); // Start polling loop
 */
export function createScheduler(config: SchedulerConfig): WorkflowScheduler {
  switch (config.type) {
    case "queue": {
      if (!config.queue) {
        throw new Error("Queue binding required for queue scheduler");
      }
      return new QueueScheduler(config.queue, {
        defaultAuthorization: config.defaultAuthorization,
      });
    }

    case "polling": {
      if (!config.dbAdapter) {
        throw new Error("Database adapter required for polling scheduler");
      }
      return new PollingScheduler(config.dbAdapter, config.pollingConfig);
    }

    default:
      throw new Error(`Unknown scheduler type: ${config.type}`);
  }
}

/**
 * Create a queue scheduler (convenience function for Cloudflare Workers).
 *
 * @param queue - Cloudflare Queue binding
 * @param defaultAuthorization - Optional default authorization token
 * @returns QueueScheduler instance
 */
export function createQueueSchedulerFromBinding(
  queue: Queue<QueueMessage>,
  defaultAuthorization?: string,
): QueueScheduler {
  return new QueueScheduler(queue, { defaultAuthorization });
}

/**
 * Create a polling scheduler (convenience function for Node.js servers).
 *
 * @param dbAdapter - Database adapter
 * @param config - Optional polling configuration
 * @returns PollingScheduler instance
 */
export function createPollingSchedulerFromAdapter(
  dbAdapter: PollingDatabaseAdapter,
  config?: PollingSchedulerConfig,
): PollingScheduler {
  return new PollingScheduler(dbAdapter, config);
}

