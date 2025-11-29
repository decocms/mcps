# Workflow Execution Engine - Design Document

> **Status**: Draft  
> **Date**: November 2025  
> **References**: 
> - `packages/durable` - Event-sourced workflow engine
> - `packages/dbos-transact-ts` - Postgres-backed durable workflows
>
> **Key Requirement**: Multi-database support (SQLite, MySQL, PostgreSQL)

---

## 1. Problem Statement

The current workflow execution implementation in `vibecoding-toolkit` has several critical issues that can lead to data loss, duplicate execution, and unreliable workflow processing.

### Current Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| Queue handler returns after first message | Only first message in batch is processed, rest are lost | 🔴 Critical |
| No retry mechanism | Failed steps are permanently lost | 🔴 Critical |
| No execution locking | Race conditions can cause duplicate step execution | 🔴 Critical |
| Token captured at enqueue time | Token may expire before queue processes message | 🟡 High |
| No atomic operations | Partial failures leave inconsistent state | 🟡 High |
| Silent error handling | Errors are logged but messages are dropped | 🔴 Critical |

---

## 2. Design Goals

1. **Reliability**: Guarantee at-least-once execution of every workflow step
2. **Durability**: Survive worker crashes, network failures, and service restarts
3. **Consistency**: Prevent duplicate execution through proper locking
4. **Observability**: Track retry attempts, failures, and execution history
5. **Scalability**: Support concurrent workflow executions with proper isolation

---

## 3. Architecture Overview

### 3.1 Key Concepts from Durable Package

The `durable` package implements a robust event-sourced workflow engine. Key patterns to adopt:

```
┌─────────────────────────────────────────────────────────────────┐
│                      WORKFLOW EXECUTION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│   │ Pending  │───▶│ Executor │───▶│ History  │                 │
│   │  Events  │    │          │    │  Events  │                 │
│   └──────────┘    └────┬─────┘    └──────────┘                 │
│                        │                                         │
│                   ┌────▼─────┐                                  │
│                   │  State   │◀── Event Sourcing                │
│                   │  Replay  │                                  │
│                   └──────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUEUE MESSAGE                                │
│  { executionId, stepIndex?, retryCount? }                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   QUEUE HANDLER                                  │
│  • Process ALL messages in batch                                 │
│  • Explicit ack/retry per message                               │
│  • Error isolation per message                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  EXECUTION LOCK                                  │
│  • Acquire lock before execution                                 │
│  • Lock timeout for stuck executions                            │
│  • Release on success or permanent failure                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STEP EXECUTOR                                  │
│  • Load execution state                                          │
│  • Determine current step                                        │
│  • Execute step with timeout                                     │
│  • Persist result atomically                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐
│    ON SUCCESS       │  │     ON FAILURE      │
│  • Save step result │  │  • Check retry limit│
│  • Queue next step  │  │  • Calc backoff     │
│  • Release lock     │  │  • Queue retry      │
│  • Ack message      │  │  • Release lock     │
└─────────────────────┘  └─────────────────────┘
```

---

## 4. Detailed Design

### 4.1 Queue Message Schema

Current schema captures token at enqueue time (problematic):
```typescript
// ❌ Current
{ executionId: string; authorization: string }
```

Proposed schema - defer auth to execution time:
```typescript
// ✅ Proposed
interface QueueMessage {
  executionId: string;
  retryCount: number;
  enqueuedAt: number;  // epoch ms
  authorization: string; // keep it for now
}
```

### 4.2 Queue Handler Pattern

```typescript
async queue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
) {
  // Process ALL messages - no early return
  for (const message of batch.messages) {
    const { executionId, retryCount = 0, enqueuedAt } = message.body;
    
    try {
      // 1. Check if message is too old (stale)
      const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - enqueuedAt > MAX_AGE_MS) {
        console.warn(`Dropping stale message for ${executionId}`);
        message.ack();
        continue;
      }
      
      // 2. Attempt execution
      await executeWorkflowStep(env, executionId);
      
      // 3. Success - acknowledge
      message.ack();
      
    } catch (error) {
      console.error(`Execution failed for ${executionId}:`, error);
      
      // 4. Check retry limits
      const MAX_RETRIES = 10;
      if (retryCount >= MAX_RETRIES) {
        // Mark execution as permanently failed
        await markExecutionFailed(env, executionId, error);
        message.ack(); // Don't retry forever
        continue;
      }
      
      // 5. Retry with exponential backoff
      const backoffSeconds = calculateBackoff(retryCount);
      message.retry({ delaySeconds: backoffSeconds });
    }
  }
}
```

### 4.3 Execution Locking

Prevent concurrent execution of the same workflow:

```sql
-- Add lock columns to workflow_executions table
ALTER TABLE workflow_executions ADD COLUMN locked_at TIMESTAMP;
ALTER TABLE workflow_executions ADD COLUMN locked_until TIMESTAMP;
ALTER TABLE workflow_executions ADD COLUMN lock_id TEXT;
```

Lock acquisition:
```typescript
async function acquireLock(
  env: Env, 
  executionId: string, 
  lockDurationMs: number = 5 * 60 * 1000 // 5 min default
): Promise<{ acquired: boolean; lockId?: string }> {
  const lockId = crypto.randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockDurationMs);
  
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_executions 
      SET locked_at = $1, locked_until = $2, lock_id = $3
      WHERE id = $4 
        AND (locked_until IS NULL OR locked_until < $1)
      RETURNING id
    `,
    params: [now.toISOString(), lockUntil.toISOString(), lockId, executionId],
  });
  
  return {
    acquired: result.result[0]?.results?.length > 0,
    lockId: result.result[0]?.results?.length > 0 ? lockId : undefined,
  };
}
```

### 4.4 Retry with Exponential Backoff

Adopt the durable package's pattern:

```typescript
const MAX_RETRY_COUNT = 10;
const MAXIMUM_BACKOFF_SECONDS = 300; // 5 minutes
const BASE_DELAY_SECONDS = 2;

function calculateBackoff(retryCount: number): number {
  // Exponential backoff: 2^retryCount
  const exponentialDelay = Math.pow(2, retryCount) * BASE_DELAY_SECONDS;
  
  // Add jitter (1-3 seconds)
  const jitter = Math.floor(Math.random() * 3) + 1;
  
  // Cap at maximum
  return Math.min(exponentialDelay + jitter, MAXIMUM_BACKOFF_SECONDS);
}

// Retry sequence: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s (capped)
```

### 4.5 Step Execution Flow

```typescript
async function executeWorkflowStep(env: Env, executionId: string) {
  // 1. Acquire lock
  const lock = await acquireLock(env, executionId);
  if (!lock.acquired) {
    throw new Error('LOCKED'); // Will retry later
  }
  
  try {
    // 2. Load execution state
    const execution = await loadExecution(env, executionId);
    
    // 3. Validate state
    if (!['pending', 'running'].includes(execution.status)) {
      return; // Already completed or cancelled
    }
    
    // 4. Determine current step
    const currentStep = await determineCurrentStep(env, execution);
    if (!currentStep) {
      // All steps completed
      await markExecutionCompleted(env, executionId);
      return;
    }
    
    // 5. Execute step (with timeout)
    const result = await executeStepWithTimeout(env, execution, currentStep);
    
    // 6. Persist result atomically
    await persistStepResult(env, executionId, currentStep.name, result);
    
    // 7. Queue next step (if any)
    await queueNextStepIfNeeded(env, execution, currentStep);
    
  } finally {
    // 8. Always release lock
    await releaseLock(env, executionId, lock.lockId);
  }
}
```

### 4.6 Atomic State Updates

Use database transactions for consistency:

```typescript
async function persistStepResult(
  env: Env,
  executionId: string,
  stepId: string,
  result: unknown,
) {
  // Use a transaction to ensure atomicity
  // Both operations succeed or both fail
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      BEGIN;
      
      -- Update step result
      UPDATE execution_step_results 
      SET output = $1, completed_at_epoch_ms = $2
      WHERE execution_id = $3 AND step_id = $4;
      
      -- Update execution state
      UPDATE workflow_executions
      SET updated_at = $5
      WHERE id = $3;
      
      COMMIT;
    `,
    params: [
      JSON.stringify(result),
      Date.now(),
      executionId,
      stepId,
      new Date().toISOString(),
    ],
  });
}
```

---

## 5. Error Handling Strategy

### 5.1 Error Categories

| Category | Retry? | Action |
|----------|--------|--------|
| Transient (5xx, timeout, network) | Yes | Exponential backoff retry |
| Rate Limited (429) | Yes | Retry after `Retry-After` header |
| Client Error (4xx except 429) | No | Mark step failed, continue or halt |
| Validation Error | No | Mark step failed with details |
| Lock Contention | Yes | Short delay, then retry |
| Max Retries Exceeded | No | Mark execution failed |

### 5.2 Execution Status State Machine

```
                    ┌─────────────┐
                    │   pending   │
                    └──────┬──────┘
                           │ start
                           ▼
                    ┌─────────────┐
        ┌──────────▶│   running   │◀──────────┐
        │           └──────┬──────┘           │
        │                  │                   │
        │    step          │ all steps         │ retry
        │    failed        │ completed         │
        │    (retry)       │                   │
        │                  ▼                   │
        │           ┌─────────────┐           │
        └───────────│  completed  │           │
                    └─────────────┘           │
                                              │
                    ┌─────────────┐           │
                    │   failed    │───────────┘
                    └─────────────┘
                          ▲
                          │ max retries exceeded
                          │ or non-retryable error
```

---

## 6. Observability

### 6.1 Execution Metrics

Add columns to track execution health:

```sql
ALTER TABLE workflow_executions ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE workflow_executions ADD COLUMN last_error TEXT;
ALTER TABLE workflow_executions ADD COLUMN last_retry_at TIMESTAMP;
```

### 6.2 Step-Level Tracking

Track each step's execution attempts:

```sql
ALTER TABLE execution_step_results ADD COLUMN attempt_count INTEGER DEFAULT 0;
ALTER TABLE execution_step_results ADD COLUMN last_error TEXT;
ALTER TABLE execution_step_results ADD COLUMN errors JSONB; -- Array of all errors
```

### 6.3 Logging Pattern

```typescript
const log = {
  executionId,
  stepId,
  retryCount,
  duration: endTime - startTime,
  status: 'success' | 'failed' | 'retrying',
  error?: string,
};
console.log('[WORKFLOW]', JSON.stringify(log));
```

---

## 7. Migration Plan

### Phase 1: Fix Critical Queue Handler Bug
1. Remove early `return` from queue handler
2. Add explicit `message.ack()` on success
3. Add `message.retry()` on failure

### Phase 2: Add Retry Mechanism
1. Update queue message schema
2. Implement exponential backoff
3. Add max retry limit
4. Track retry count in database

### Phase 3: Add Execution Locking
1. Add lock columns to database
2. Implement `acquireLock` / `releaseLock`
3. Add lock timeout handling

### Phase 4: Atomic Operations
1. Group related database operations
2. Use transactions where available
3. Add consistency checks

### Phase 5: Observability
1. Add execution metrics columns
2. Implement structured logging
3. Add error tracking

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Backoff calculation
- Lock acquisition/release
- Step resolution logic

### 8.2 Integration Tests
- Full workflow execution happy path
- Retry after transient failure
- Lock contention handling
- Max retry exceeded

### 8.3 Chaos Testing
- Kill worker mid-execution
- Simulate database failures
- Network partition simulation

---

## 9. Open Questions

2. **Dead Letter Queue**: Should permanently failed executions be moved to a DLQ for manual inspection?

3. **Cancellation**: How should we handle in-flight executions when a workflow is cancelled?

4. **Step Timeout**: What should be the default timeout per step? Currently none.

5. **Parallel Steps**: Future consideration - should we support parallel step execution?

---

## 10. Database Abstraction Layer

### 10.1 Design Principle

Unlike DBOS (Postgres-only) and Durable (Postgres-only), we need to support multiple databases. The design must avoid database-specific features or provide abstractions.

### 10.2 Database-Specific Features to Abstract

| Feature | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| **Row Locking** | `FOR UPDATE SKIP LOCKED` | `FOR UPDATE SKIP LOCKED` (8.0+) | Not supported |
| **Pub/Sub** | `LISTEN/NOTIFY` | Not native | Not supported |
| **Upsert** | `ON CONFLICT DO UPDATE` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT DO UPDATE` |
| **Transactions** | Full ACID | Full ACID | Full ACID |
| **JSON** | `JSONB` native | `JSON` native | Text (parse in app) |

### 10.3 Lock Strategy Abstraction

Since SQLite doesn't support row-level locking, we use **timestamp-based optimistic locking**:

```typescript
interface LockStrategy {
  acquireLock(executionId: string, durationMs: number): Promise<LockResult>;
  releaseLock(executionId: string, lockId: string): Promise<boolean>;
  extendLock(executionId: string, lockId: string, durationMs: number): Promise<boolean>;
}

// Implementation works across all databases:
// 1. Check if locked_until < NOW or IS NULL
// 2. Update locked_until = NOW + duration, lock_id = new_uuid
// 3. If rows affected = 1, lock acquired
// 4. This is essentially "compare-and-swap" at the row level
```

### 10.4 Notification Strategy

Instead of relying on `LISTEN/NOTIFY`, we use **polling with adaptive intervals**:

```typescript
class WorkflowQueuePoller {
  private pollingIntervalMs = 1000;
  private readonly minInterval = 500;
  private readonly maxInterval = 30000;

  async poll() {
    const pending = await findPendingExecutions();
    
    if (pending.length > 0) {
      // Work found - decrease interval
      this.pollingIntervalMs = Math.max(
        this.minInterval,
        this.pollingIntervalMs * 0.8
      );
    } else {
      // No work - increase interval
      this.pollingIntervalMs = Math.min(
        this.maxInterval,
        this.pollingIntervalMs * 1.2
      );
    }
    
    return pending;
  }
}
```

### 10.5 SQL Dialect Abstraction

Use parameterized queries that work across databases:

```typescript
interface DatabaseDialect {
  // Timestamp functions
  now(): string;                      // NOW(), datetime('now'), etc.
  epochMs(): string;                  // Current time as epoch milliseconds
  
  // Query builders
  upsert(table: string, data: object, conflictKeys: string[]): { sql: string; params: unknown[] };
  
  // Lock queries (use timestamp-based approach for all)
  acquireLockQuery(table: string): string;
  releaseLockQuery(table: string): string;
}

// Example implementations:
const postgresDialect: DatabaseDialect = {
  now: () => 'NOW()',
  epochMs: () => "EXTRACT(epoch FROM NOW()) * 1000",
  // ...
};

const sqliteDialect: DatabaseDialect = {
  now: () => "datetime('now')",
  epochMs: () => "CAST(strftime('%s', 'now') AS INTEGER) * 1000",
  // ...
};
```

### 10.6 Schema Design (Database-Agnostic)

```sql
-- Works on PostgreSQL, MySQL, and SQLite
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inputs TEXT,                      -- JSON as text
  output TEXT,                      -- JSON as text
  
  -- Timestamps as ISO strings (portable) or epoch ms
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  
  -- Lock columns
  locked_at TEXT,
  locked_until TEXT,
  lock_id TEXT,
  
  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  last_error TEXT,
  
  -- Foreign keys
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE execution_step_results (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,                       -- JSON as text
  output TEXT,                      -- JSON as text
  error TEXT,
  
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  attempt_count INTEGER DEFAULT 1,
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id),
  UNIQUE (execution_id, step_id)
);

-- Index for finding pending executions
CREATE INDEX idx_executions_pending 
ON workflow_executions (status, locked_until) 
WHERE status IN ('pending', 'running');
```

### 10.7 Key Patterns from DBOS (Adapted)

| DBOS Pattern | Our Adaptation |
|--------------|----------------|
| `FOR UPDATE SKIP LOCKED` | Timestamp-based optimistic locking |
| `LISTEN/NOTIFY` | Polling with adaptive intervals |
| Postgres-specific SQL | Dialect abstraction layer |
| `recovery_attempts` on workflow | Same, stored in `retry_count` |
| `operation_outputs` table | `execution_step_results` table |
| `@dbRetry()` decorator | `withRetry()` wrapper function |

---

## 11. Additional Patterns from DBOS

### 11.1 Workflow Fork (Restart from Step)

Allow restarting a failed workflow from a specific step:

```typescript
async function forkWorkflow(
  env: Env,
  executionId: string,
  fromStepIndex: number,
): Promise<string> {
  const newExecutionId = crypto.randomUUID();
  
  // Copy execution with new ID
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_executions (id, workflow_id, status, inputs, ...)
      SELECT $1, workflow_id, 'pending', inputs, ...
      FROM workflow_executions WHERE id = $2
    `,
    params: [newExecutionId, executionId],
  });
  
  // Copy step results up to fromStepIndex
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO execution_step_results (id, execution_id, step_id, ...)
      SELECT $1 || '-' || step_id, $2, step_id, ...
      FROM execution_step_results
      WHERE execution_id = $3 AND step_index < $4
    `,
    params: [newExecutionId, newExecutionId, executionId, fromStepIndex],
  });
  
  return newExecutionId;
}
```

### 11.2 Step Configuration

Per-step retry configuration (from DBOS):

```typescript
interface StepConfig {
  retriesAllowed?: boolean;     // Enable step-level retries
  maxAttempts?: number;         // Max attempts for this step
  intervalSeconds?: number;     // Initial retry delay
  backoffRate?: number;         // Exponential backoff multiplier
  timeoutSeconds?: number;      // Step execution timeout
}
```

### 11.3 Database Operation Retry

Wrap database operations with automatic retry:

```typescript
async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; initialBackoff?: number } = {}
): Promise<T> {
  const { maxRetries = 5, initialBackoff = 1000 } = options;
  let backoff = initialBackoff;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === maxRetries) {
        throw error;
      }
      
      const jitter = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
      await sleep(backoff * jitter);
      backoff = Math.min(backoff * 2, 60000); // Max 60s
    }
  }
  
  throw new Error('Unreachable');
}

function isRetryableDbError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('econnreset') ||
    message.includes('busy') ||     // SQLite
    message.includes('locked')      // SQLite
  );
}
```

---

## 12. References

- [Durable Package Implementation](../../packages/durable/)
- [DBOS Transact Implementation](../../packages/dbos-transact-ts/)
- [Cloudflare Queues Documentation](https://developers.cloudflare.com/queues/)
- [Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)

---

## Appendix A: Related Documentation

- [DURABLE_PATTERNS.md](./DURABLE_PATTERNS.md) - Patterns from the durable package
- [DBOS_PATTERNS.md](./DBOS_PATTERNS.md) - Patterns from DBOS Transact
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Practical implementation guide


