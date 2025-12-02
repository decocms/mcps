# Workflow Scheduler Architecture

> **Runtime-Agnostic Scheduling for Durable Workflows**
>
> Design and implementation guide for pluggable workflow schedulers that work across Cloudflare Workers, Node.js servers, AWS Lambda, and other runtimes.

**Date**: November 2025  
**Status**: Implementation Guide  
**Related Docs**:
- [WORKFLOW_EXECUTION_DESIGN.md](./WORKFLOW_EXECUTION_DESIGN.md)
- [DURABLE_PATTERNS.md](./DURABLE_PATTERNS.md)
- [DBOS_PATTERNS.md](./DBOS_PATTERNS.md)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Principles](#2-design-principles)
3. [The Scheduler Interface](#3-the-scheduler-interface)
4. [Current Implementation](#4-current-implementation)
5. [Scheduler Implementations](#5-scheduler-implementations)
6. [Integration Guide](#6-integration-guide)
7. [Migration Paths](#7-migration-paths)
8. [Appendix](#appendix)

---

## 1. Problem Statement

### 1.1 The Wake-Up Problem

Durable workflow execution requires solving the "wake-up" problem:

```
┌─────────────────────────────────────────────────┐
│  Workflow Step Completed                        │
│         ↓                                       │
│  How do we wake up to execute the next step?   │
│         ↓                                       │
│  • Immediately?                                 │
│  • In 5 minutes?                                │
│  • Tomorrow at 9am?                             │
│  • When another workflow completes?             │
└─────────────────────────────────────────────────┘
```

### 1.2 Runtime-Specific Challenges

Different runtimes have different wake-up mechanisms:

| Runtime | Available Mechanisms | Limitations |
|---------|---------------------|-------------|
| **Cloudflare Workers** | Queue, Cron Triggers, Durable Objects | Queues max 7-day delay, no persistent connections |
| **Node.js Server** | Polling loop, timers, database LISTEN/NOTIFY | Needs persistent process |
| **AWS Lambda** | EventBridge, SQS, Step Functions | Cold start overhead |
| **Generic Serverless** | External cron service (e.g., cron-job.org) | Polling only |

### 1.3 Requirements

1. **Runtime Agnostic**: Same workflow engine works everywhere
2. **Scheduled Execution**: Support future execution times (not just immediate)
3. **Recovery**: Detect and recover orphaned/stuck executions
4. **Flexible**: Let users choose their runtime and scheduler
5. **No Lock-In**: Don't force a specific infrastructure

---

## 2. Design Principles

### 2.1 Separation of Concerns

```typescript
┌────────────────────────────────────────────────┐
│         Workflow Executor (Core)               │
│  • Lock acquisition                            │
│  • Step execution                              │
│  • State persistence                           │
│  • Error handling                              │
│  ↑                                             │
│  │ calls                                       │
│  │                                             │
├────────────────────────────────────────────────┤
│         Scheduler (Pluggable)                  │
│  • When to wake up                             │
│  • How to trigger execution                    │
│  • Scheduled vs immediate                      │
└────────────────────────────────────────────────┘
```

**Key insight**: The executor doesn't know HOW it gets called. The scheduler doesn't know WHAT execution does.

### 2.2 The Inversion Challenge

Unlike database bindings (where your code CALLS the database), schedulers CALL your code:

```typescript
// Database: You call out
await env.DATABASE.RUN_SQL({ sql: "...", params: [] });

// Scheduler: Something calls you
// ??? → your workflow executor
```

This inversion means the scheduler must be part of your runtime configuration, not a binding.

### 2.3 Storage is Shared, Wake-up is Runtime-Specific

All schedulers share the same database for workflow state:

```typescript
// All schedulers read/write the same tables:
workflow_executions {
  id, status, scheduled_for_epoch_ms, locked_until, ...
}
```

But each scheduler uses a different wake-up mechanism:
- **Queue**: Message with delay
- **Polling**: Periodic DB query
- **Cron**: External HTTP trigger
- **Durable Object**: Built-in alarm

---

## 3. The Scheduler Interface

### 3.1 Core Interface

```typescript
/**
 * Minimal interface for scheduling workflow executions.
 * 
 * The scheduler's job:
 * 1. Accept a request to run an execution (now or later)
 * 2. Ensure the execution gets processed (somehow)
 */
export interface WorkflowScheduler {
  /**
   * Schedule an execution to run.
   * 
   * @param executionId - The execution to run
   * @param options.runAt - When to run (undefined = ASAP)
   * @param options.authorization - Token for auth context
   * @returns Promise that resolves when scheduling is complete
   */
  schedule(
    executionId: string,
    options?: {
      runAt?: Date;
      authorization?: string;
    }
  ): Promise<void>;

  /**
   * Cancel a scheduled execution (optional).
   * Some schedulers may not support cancellation.
   */
  cancel?(executionId: string): Promise<void>;
}

/**
 * For schedulers that need external triggering.
 * Examples: cron jobs, manual endpoints, Lambda functions
 */
export interface TickableScheduler extends WorkflowScheduler {
  /**
   * Process any pending executions.
   * Called by: cron trigger, HTTP endpoint, polling loop
   * 
   * @returns Number of executions processed
   */
  tick(): Promise<{ processed: number; errors?: number }>;
}

/**
 * For schedulers with persistent background processes.
 * Examples: long-running Node.js servers, worker processes
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
```

### 3.2 Design Rationale

**Why `schedule()` instead of `enqueue()`?**
- Not all schedulers use queues
- Scheduling is the abstract concept; queue is one implementation

**Why `tick()` as a separate interface?**
- Queue-based schedulers don't need `tick()` - the queue calls them
- Separates "background process" from "triggered process" schedulers

**Why include `authorization`?**
- Workflows may need user context
- Serverless functions may not have session state
- Captured at schedule time, used at execution time

---

## 4. Current Implementation

### 4.1 Queue-Based Scheduler (Cloudflare Workers)

The current implementation uses Cloudflare Queues:

```typescript
// server/main.ts
export default {
  ...runtime,
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleWorkflowQueue(batch, env);
  },
};
```

**Message Flow:**

```
1. Tool call creates execution
   ↓
2. Queue message sent (with optional delay)
   ↓
3. Queue consumer receives message
   ↓
4. HTTP call to START_EXECUTION_V2 tool
   ↓
5. Durable executor processes step
   ↓
6. If more steps: queue next message (goto 2)
   If complete: done
```

### 4.2 Queue Message Schema

```typescript
// server/collections/workflow-schemas-v2.ts
export const QueueMessageSchema = z.object({
  executionId: z.string(),
  retryCount: z.number().default(0),
  enqueuedAt: z.number(),        // epoch ms
  authorization: z.string(),     // Bearer token
});
```

### 4.3 Queue Handler

```typescript
// server/queue-handler.ts
export async function handleWorkflowQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  config: QueueHandlerConfig = {},
): Promise<void> {
  // Process ALL messages (no early return)
  for (const message of batch.messages) {
    const { executionId, retryCount, authorization } = message.body;

    // Call execution tool via HTTP (env.SELF not available)
    const result = await fetch(
      `${env.DECO_APP_ENTRYPOINT}/mcp/call-tool/START_EXECUTION_V2`,
      {
        headers: { Authorization: `Bearer ${authorization}` },
        body: JSON.stringify({ executionId, retryCount }),
      }
    );

    if (result.success) {
      message.ack();  // Success - done
    } else if (shouldRetry) {
      message.retry({ delaySeconds });  // Retry with backoff
    } else {
      message.ack();  // Permanent failure - don't retry
    }
  }
}
```

### 4.4 Limitations of Queue Scheduler

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Max 7-day delay | Can't schedule workflows months ahead | Need cron for long-term scheduling |
| No recovery mechanism | Orphaned executions stay stuck | Need cron to detect and recover |
| CF Workers-specific | Can't run on Node.js, Lambda, etc. | Need pluggable schedulers |

---

## 5. Scheduler Implementations

### 5.1 Queue Scheduler (Current)

**Best for**: Cloudflare Workers, immediate to medium-term scheduling

```typescript
// server/scheduler/queue-scheduler.ts
export class QueueScheduler implements WorkflowScheduler {
  constructor(
    private queue: Queue<QueueMessage>,
  ) {}

  async schedule(
    executionId: string,
    options?: { runAt?: Date; authorization?: string }
  ): Promise<void> {
    const delaySeconds = options?.runAt
      ? Math.max(0, Math.floor((options.runAt.getTime() - Date.now()) / 1000))
      : 0;

    // CF Queue max delay: 7 days (604800 seconds)
    if (delaySeconds > 604800) {
      throw new Error(
        `Queue scheduler max delay is 7 days. Requested: ${options?.runAt?.toISOString()}`
      );
    }

    await this.queue.send(
      {
        executionId,
        retryCount: 0,
        enqueuedAt: Date.now(),
        authorization: options?.authorization ?? "",
      },
      delaySeconds > 0 ? { delaySeconds } : undefined
    );
  }
}
```

**Pros:**
- ✅ Immediate execution (no polling delay)
- ✅ Built-in retry with exponential backoff
- ✅ High throughput, low latency
- ✅ No background process needed

**Cons:**
- ❌ Max 7-day scheduling horizon
- ❌ CF Workers-specific
- ❌ No orphan recovery
- ❌ Can't cancel scheduled messages

---

### 5.2 Polling Scheduler

**Best for**: Long-running Node.js servers, self-hosted deployments

```typescript
// server/scheduler/polling-scheduler.ts
export class PollingScheduler implements RunnableScheduler {
  private running = false;
  private intervalMs = 1000;
  private readonly minInterval = 500;
  private readonly maxInterval = 30000;

  constructor(
    private db: Database,
    private executor: (executionId: string, auth: string) => Promise<void>,
  ) {}

  async schedule(
    executionId: string,
    options?: { runAt?: Date }
  ): Promise<void> {
    // Just write to DB - polling will pick it up
    await this.db.query(
      `UPDATE workflow_executions 
       SET scheduled_for_epoch_ms = $1, status = 'pending'
       WHERE id = $2`,
      [options?.runAt?.getTime() ?? Date.now(), executionId]
    );
  }

  async tick(): Promise<{ processed: number; errors?: number }> {
    const now = Date.now();

    // Find executions ready to run
    const pending = await this.db.query<{
      id: string;
      authorization: string;
    }>(
      `SELECT id, created_by as authorization
       FROM workflow_executions 
       WHERE status IN ('pending', 'running')
         AND (scheduled_for_epoch_ms IS NULL OR scheduled_for_epoch_ms <= $1)
         AND (locked_until IS NULL OR locked_until < $2)
       ORDER BY scheduled_for_epoch_ms ASC NULLS FIRST
       LIMIT 10`,
      [now, new Date().toISOString()]
    );

    // Adaptive interval based on work found
    if (pending.length > 0) {
      this.intervalMs = Math.max(this.minInterval, this.intervalMs * 0.8);
    } else {
      this.intervalMs = Math.min(this.maxInterval, this.intervalMs * 1.2);
    }

    // Execute each
    let errors = 0;
    for (const { id, authorization } of pending) {
      try {
        await this.executor(id, authorization);
      } catch (e) {
        console.error(`[POLL] Failed to execute ${id}:`, e);
        errors++;
      }
    }

    return { processed: pending.length, errors };
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('[POLL] Starting scheduler');

    while (this.running) {
      await this.tick();
      await new Promise((r) => setTimeout(r, this.intervalMs));
    }

    console.log('[POLL] Scheduler stopped');
  }

  stop(): Promise<void> {
    this.running = false;
    return Promise.resolve();
  }

  isRunning(): boolean {
    return this.running;
  }
}
```

**Pros:**
- ✅ No scheduling horizon limit
- ✅ Works with any database
- ✅ Detects orphaned executions
- ✅ Adaptive polling interval
- ✅ Can cancel by updating DB

**Cons:**
- ❌ Polling delay (500ms-30s)
- ❌ Requires persistent process
- ❌ More CPU/DB usage than queue
- ❌ Need to handle process restarts

---

### 5.3 HTTP/Cron Scheduler

**Best for**: Generic serverless (AWS Lambda, Vercel, etc.), external cron services

```typescript
// server/scheduler/http-scheduler.ts
export class HttpScheduler implements TickableScheduler {
  constructor(
    private db: Database,
    private executor: (executionId: string, auth: string) => Promise<void>,
  ) {}

  async schedule(
    executionId: string,
    options?: { runAt?: Date }
  ): Promise<void> {
    // Write to DB - external cron will trigger tick()
    await this.db.query(
      `UPDATE workflow_executions 
       SET scheduled_for_epoch_ms = $1, status = 'pending'
       WHERE id = $2`,
      [options?.runAt?.getTime() ?? Date.now(), executionId]
    );
  }

  async tick(): Promise<{ processed: number; errors?: number }> {
    const now = Date.now();

    const pending = await this.db.query<{
      id: string;
      authorization: string;
    }>(
      `SELECT id, created_by as authorization
       FROM workflow_executions 
       WHERE status IN ('pending', 'running')
         AND (scheduled_for_epoch_ms IS NULL OR scheduled_for_epoch_ms <= $1)
         AND (locked_until IS NULL OR locked_until < $2)
       LIMIT 10`,
      [now, new Date().toISOString()]
    );

    let errors = 0;
    for (const { id, authorization } of pending) {
      try {
        await this.executor(id, authorization);
      } catch (e) {
        console.error(`[HTTP] Failed to execute ${id}:`, e);
        errors++;
      }
    }

    return { processed: pending.length, errors };
  }
}
```

**Usage with external cron:**

```typescript
// server/main.ts
const httpScheduler = new HttpScheduler(db, executeWorkflow);

// Expose endpoint
app.post('/api/scheduler/tick', async (req, res) => {
  const result = await httpScheduler.tick();
  res.json(result);
});

// External cron calls: POST https://your-app.com/api/scheduler/tick
// Frequency: every 1-5 minutes
```

**Pros:**
- ✅ Works on any serverless platform
- ✅ No persistent process needed
- ✅ Simple to understand
- ✅ Can use free cron services

**Cons:**
- ❌ Polling delay (depends on cron frequency)
- ❌ Requires external service
- ❌ Less precise than queue
- ❌ HTTP endpoint must be protected

---

### 5.4 Hybrid Scheduler

**Best for**: Production systems that need both immediate and long-term scheduling

```typescript
// server/scheduler/hybrid-scheduler.ts
export class HybridScheduler implements RunnableScheduler {
  constructor(
    private primaryScheduler: WorkflowScheduler,  // Queue for immediate
    private fallbackScheduler: RunnableScheduler, // Polling for long-term + recovery
  ) {}

  async schedule(
    executionId: string,
    options?: { runAt?: Date; authorization?: string }
  ): Promise<void> {
    const delay = options?.runAt
      ? options.runAt.getTime() - Date.now()
      : 0;

    // Use queue for < 7 days, polling for >= 7 days
    if (delay < 7 * 24 * 60 * 60 * 1000) {
      await this.primaryScheduler.schedule(executionId, options);
    } else {
      await this.fallbackScheduler.schedule(executionId, options);
    }
  }

  async tick(): Promise<{ processed: number; errors?: number }> {
    return await this.fallbackScheduler.tick();
  }

  async start(): Promise<void> {
    await this.fallbackScheduler.start();
  }

  async stop(): Promise<void> {
    await this.fallbackScheduler.stop();
  }

  isRunning(): boolean {
    return this.fallbackScheduler.isRunning();
  }
}
```

**Usage:**

```typescript
const hybridScheduler = new HybridScheduler(
  new QueueScheduler(env.WORKFLOW_QUEUE),  // Fast path
  new PollingScheduler(db, executor)        // Slow path + recovery
);

// Immediate execution → queue
await hybridScheduler.schedule("exec-123");

// Next week → queue
await hybridScheduler.schedule("exec-456", { 
  runAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) 
});

// Next month → polling
await hybridScheduler.schedule("exec-789", { 
  runAt: new Date("2025-12-01") 
});
```

---

### 5.5 PostgreSQL LISTEN/NOTIFY Scheduler

**Best for**: Systems with PostgreSQL, need immediate notification

```typescript
// server/scheduler/pg-notify-scheduler.ts
export class PostgresNotifyScheduler implements RunnableScheduler {
  private running = false;
  private client: Client;
  private recoveryPoller: PollingScheduler;

  constructor(
    private pgClient: Client,
    private db: Database,
    private executor: (executionId: string, auth: string) => Promise<void>,
  ) {
    // Also run slow polling for scheduled + recovery
    this.recoveryPoller = new PollingScheduler(db, executor);
  }

  async schedule(
    executionId: string,
    options?: { runAt?: Date }
  ): Promise<void> {
    // Insert/update triggers NOTIFY
    await this.db.query(
      `UPDATE workflow_executions 
       SET scheduled_for_epoch_ms = $1, status = 'pending'
       WHERE id = $2`,
      [options?.runAt?.getTime() ?? Date.now(), executionId]
    );
    // Database trigger will: NOTIFY new_execution, '<executionId>'
  }

  async start(): Promise<void> {
    this.running = true;

    // Listen for immediate executions
    await this.client.query('LISTEN new_execution');
    this.client.on('notification', async (msg) => {
      if (msg.channel === 'new_execution' && msg.payload) {
        try {
          await this.executor(msg.payload, '');
        } catch (e) {
          console.error(`[NOTIFY] Failed to execute ${msg.payload}:`, e);
        }
      }
    });

    // Also start slow poll for scheduled/recovery
    this.recoveryPoller.start();
  }

  async tick(): Promise<{ processed: number; errors?: number }> {
    return await this.recoveryPoller.tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.query('UNLISTEN new_execution');
    await this.recoveryPoller.stop();
  }

  isRunning(): boolean {
    return this.running;
  }
}
```

**Database trigger:**

```sql
CREATE OR REPLACE FUNCTION notify_new_execution()
RETURNS trigger AS $$
BEGIN
  -- Only notify for immediate executions
  IF NEW.scheduled_for_epoch_ms IS NULL 
     OR NEW.scheduled_for_epoch_ms <= EXTRACT(epoch FROM NOW()) * 1000 THEN
    PERFORM pg_notify('new_execution', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER new_execution_trigger
AFTER INSERT OR UPDATE ON workflow_executions
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION notify_new_execution();
```

---

## 6. Integration Guide

### 6.1 Scheduler Factory Pattern

```typescript
// server/scheduler/factory.ts
export type SchedulerType = 
  | 'queue'           // CF Workers Queue
  | 'polling'         // Long-running process
  | 'http'            // External cron
  | 'hybrid'          // Queue + polling
  | 'pg-notify';      // PostgreSQL LISTEN/NOTIFY

export interface SchedulerConfig {
  type: SchedulerType;
  
  // Queue config
  queue?: Queue<QueueMessage>;
  
  // Database config
  db?: Database;
  pgClient?: Client;
  
  // Executor
  executor: (executionId: string, authorization: string) => Promise<void>;
}

export function createScheduler(config: SchedulerConfig): WorkflowScheduler {
  switch (config.type) {
    case 'queue':
      if (!config.queue) throw new Error('Queue required for queue scheduler');
      return new QueueScheduler(config.queue);

    case 'polling':
      if (!config.db || !config.executor) {
        throw new Error('DB and executor required for polling scheduler');
      }
      return new PollingScheduler(config.db, config.executor);

    case 'http':
      if (!config.db || !config.executor) {
        throw new Error('DB and executor required for HTTP scheduler');
      }
      return new HttpScheduler(config.db, config.executor);

    case 'hybrid':
      if (!config.queue || !config.db || !config.executor) {
        throw new Error('Queue, DB, and executor required for hybrid scheduler');
      }
      return new HybridScheduler(
        new QueueScheduler(config.queue),
        new PollingScheduler(config.db, config.executor)
      );

    case 'pg-notify':
      if (!config.pgClient || !config.db || !config.executor) {
        throw new Error('PG client, DB, and executor required');
      }
      return new PostgresNotifyScheduler(
        config.pgClient,
        config.db,
        config.executor
      );

    default:
      throw new Error(`Unknown scheduler type: ${config.type}`);
  }
}
```

### 6.2 Using the Scheduler

```typescript
// server/main.ts
import { createScheduler } from "./scheduler/factory.ts";
import { executeWorkflowDurable } from "./workflow-runner/durable-executor.ts";

// Create scheduler based on environment
const scheduler = createScheduler({
  type: env.SCHEDULER_TYPE ?? 'queue',
  queue: env.WORKFLOW_QUEUE,
  db: env.DATABASE,
  executor: async (executionId, authorization) => {
    // Call the execution tool
    const response = await fetch(
      `${env.DECO_APP_ENTRYPOINT}/mcp/call-tool/START_EXECUTION_V2`,
      {
        headers: { Authorization: `Bearer ${authorization}` },
        body: JSON.stringify({ executionId, retryCount: 0 }),
      }
    );
    // Handle response...
  },
});

// For runnable schedulers, start them
if ('start' in scheduler) {
  await scheduler.start();
}

// Use scheduler in tools
export const createAndQueueExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_AND_QUEUE_EXECUTION",
    execute: async ({ context: ctx }) => {
      const execution = await createExecution(ctx.workflowId, ctx.inputs);
      
      // Schedule via pluggable scheduler
      await scheduler.schedule(execution.id, {
        runAt: ctx.scheduledFor,
        authorization: env.DECO_REQUEST_CONTEXT.token,
      });
      
      return { success: true, executionId: execution.id };
    },
  });
```

### 6.3 Configuration Examples

#### Cloudflare Workers (Current)

```toml
# wrangler.toml
[[queues.producers]]
queue = "workflow-queue"
binding = "WORKFLOW_QUEUE"

[[queues.consumers]]
queue = "workflow-queue"
max_batch_size = 10
max_batch_timeout = 5

[vars]
SCHEDULER_TYPE = "queue"
```

#### Node.js Server

```typescript
// server.ts
const scheduler = createScheduler({
  type: 'polling',
  db: await createDatabaseConnection(process.env.DATABASE_URL),
  executor: executeWorkflow,
});

await scheduler.start();

process.on('SIGTERM', async () => {
  await scheduler.stop();
  process.exit(0);
});
```

#### AWS Lambda with EventBridge

```typescript
// handler.ts
const scheduler = createScheduler({
  type: 'http',
  db: database,
  executor: executeWorkflow,
});

// CloudWatch Events Rule calls this every minute
export const tickHandler = async () => {
  const result = await scheduler.tick();
  return { statusCode: 200, body: JSON.stringify(result) };
};
```

---

## 7. Migration Paths

### 7.1 From Queue-Only to Hybrid

**Current State**: Only immediate execution works

**Migration**:

```typescript
// Step 1: Add scheduled_for_epoch_ms column (if not exists)
await db.query(`
  ALTER TABLE workflow_executions 
  ADD COLUMN IF NOT EXISTS scheduled_for_epoch_ms INTEGER
`);

// Step 2: Switch to hybrid scheduler
const scheduler = createScheduler({
  type: 'hybrid',
  queue: env.WORKFLOW_QUEUE,
  db: env.DATABASE,
  executor: executeWorkflow,
});

// Step 3: Start background polling
if ('start' in scheduler) {
  await scheduler.start();
}

// Step 4: Now supports both immediate and scheduled
await scheduler.schedule("exec-123");  // Immediate via queue
await scheduler.schedule("exec-456", { 
  runAt: new Date("2026-01-01") 
}); // Scheduled via polling
```

### 7.2 From Serverless to Self-Hosted

**Migration**:

```typescript
// Old: CF Workers with queue
const oldScheduler = new QueueScheduler(env.WORKFLOW_QUEUE);

// New: Node.js with polling
const newScheduler = new PollingScheduler(db, executor);
await newScheduler.start();

// Data migration: none needed (same DB schema)
// Executions in queue will still process
// New executions use polling
```

---

## Appendix

### A. Comparison Table

| Feature | Queue | Polling | HTTP/Cron | Hybrid | PG Notify |
|---------|-------|---------|-----------|--------|-----------|
| **Immediate execution** | ✅ <1s | ⚠️ 0.5-30s | ⚠️ 1-5min | ✅ <1s | ✅ <1s |
| **Scheduled execution** | ⚠️ <7 days | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| **Orphan recovery** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Runtime** | CF Workers | Any | Any | CF Workers | PostgreSQL |
| **Persistent process** | ❌ | ✅ | ❌ | ⚠️ Optional | ✅ |
| **External dependency** | Queue service | None | Cron service | Queue service | PostgreSQL |
| **Complexity** | Low | Medium | Low | High | High |

### B. References

- [Cloudflare Queues Docs](https://developers.cloudflare.com/queues/)
- [PostgreSQL LISTEN/NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
- [AWS EventBridge Scheduler](https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html)
- [DBOS Transact Patterns](./DBOS_PATTERNS.md)
- [Durable Package Patterns](./DURABLE_PATTERNS.md)

### C. Future Enhancements

1. **Priority Queues**: Process high-priority executions first
2. **Rate Limiting**: Limit concurrent executions per tenant
3. **Circuit Breaking**: Pause scheduling on repeated failures
4. **Metrics & Monitoring**: Track scheduler performance
5. **Dynamic Configuration**: Change scheduler at runtime
6. **Cancellation Support**: Cancel scheduled executions
7. **Batch Scheduling**: Schedule multiple executions efficiently

---

**Last Updated**: November 2025  
**Authors**: vibecoding-toolkit team  
**License**: Internal documentation



