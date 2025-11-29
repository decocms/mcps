/**
 * Scheduler Module
 *
 * Pluggable workflow schedulers for durable workflow execution.
 * Supports multiple runtimes: Cloudflare Workers, Node.js, AWS Lambda, etc.
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md
 *
 * @example Cloudflare Workers (Serverless)
 * ```typescript
 * import { createScheduler } from "./scheduler";
 *
 * // Create a queue scheduler for Cloudflare Workers
 * const scheduler = createScheduler({
 *   type: 'queue',
 *   queue: env.WORKFLOW_QUEUE,
 * });
 *
 * // Schedule an execution
 * await scheduler.schedule(executionId, {
 *   authorization: env.DECO_REQUEST_CONTEXT.token,
 * });
 * ```
 *
 * @example Node.js (Traditional Server)
 * ```typescript
 * import { createScheduler, createPollingDbAdapter } from "./scheduler";
 *
 * // Create a polling scheduler for Node.js
 * const dbAdapter = createPollingDbAdapter(env);
 * const scheduler = createScheduler({
 *   type: 'polling',
 *   dbAdapter,
 * });
 *
 * // Start the polling loop
 * await scheduler.start();
 * ```
 */

// Interfaces
export {
  type WorkflowScheduler,
  type TickableScheduler,
  type RunnableScheduler,
  type ScheduleOptions,
  type TickResult,
  isTickableScheduler,
  isRunnableScheduler,
} from "./interface.ts";

// Queue Scheduler (Cloudflare Workers / Serverless)
export {
  QueueScheduler,
  createQueueScheduler,
  type QueueSchedulerConfig,
} from "./queue-scheduler.ts";

// Polling Scheduler (Node.js / Traditional Servers)
export {
  PollingScheduler,
  createPollingScheduler,
  type PollingSchedulerConfig,
  type PollingDatabaseAdapter,
  type PendingExecution,
} from "./polling-scheduler.ts";

// Polling Database Adapters
export {
  createPollingDbAdapter,
  createPostgresPollingDbAdapter,
  type PollingDbAdapterConfig,
} from "./polling-db-adapter.ts";

// Factory
export {
  createScheduler,
  createQueueSchedulerFromBinding,
  createPollingSchedulerFromAdapter,
  type SchedulerType,
  type SchedulerConfig,
} from "./factory.ts";
