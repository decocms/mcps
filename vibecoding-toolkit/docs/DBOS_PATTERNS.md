# Patterns from DBOS Transact

> Key patterns from `packages/dbos-transact-ts` for durable workflow execution.
> **Key difference**: DBOS is Postgres-only; we need database-agnostic patterns.

---

## 1. Workflow Status State Machine

**Source**: `src/workflow.ts`

DBOS uses a well-defined status enum:

```typescript
export const StatusString = {
  PENDING: 'PENDING',                           // Workflow may be running
  SUCCESS: 'SUCCESS',                           // Completed with return value
  ERROR: 'ERROR',                               // Completed with error
  MAX_RECOVERY_ATTEMPTS_EXCEEDED: 'RETRIES_EXCEEDED', // Exceeded max retries
  CANCELLED: 'CANCELLED',                       // Cancelled
  ENQUEUED: 'ENQUEUED',                         // Queued but not started
} as const;
```

**State Transitions**:
```
                    ┌───────────────┐
    startWorkflow() │               │
         ──────────▶│   ENQUEUED    │
                    │               │
                    └───────┬───────┘
                            │ queue picks up
                            ▼
                    ┌───────────────┐
                    │               │◀──────┐
                    │    PENDING    │       │ retry
                    │               │───────┘
                    └───────┬───────┘
                    ┌───────┴───────┐
                    │               │
              ┌─────▼─────┐   ┌─────▼─────┐
              │  SUCCESS  │   │   ERROR   │
              └───────────┘   └─────┬─────┘
                                    │ resume
                              ┌─────▼─────┐
                              │RETRIES_   │
                              │EXCEEDED   │
                              └───────────┘
```

---

## 2. Operation Outputs (Step Results) Table

**Source**: `schemas/system_db_schema.ts`

DBOS stores every step's result for replay:

```typescript
interface operation_outputs {
  workflow_uuid: string;      // FK to workflow
  function_id: number;        // Step sequence number
  function_name?: string;     // Step name
  output: string;             // JSON serialized result
  error: string;              // JSON serialized error
  child_workflow_id: string;  // If step spawned child workflow
  started_at_epoch_ms?: number;
  completed_at_epoch_ms?: number;
}
```

**Key insight**: The `function_id` is an incrementing counter per workflow, allowing deterministic replay.

---

## 3. Max Recovery Attempts

**Source**: `src/workflow.ts`, `src/system_database.ts`

```typescript
export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 100;

// On workflow init:
if (maxRetries && attempts > maxRetries + 1) {
  await updateWorkflowStatus(
    client,
    workflowUUID,
    StatusString.MAX_RECOVERY_ATTEMPTS_EXCEEDED,
    { where: { status: StatusString.PENDING } }
  );
  throw new DBOSMaxRecoveryAttemptsExceededError(workflowUUID, maxRetries);
}
```

**Key insight**: Recovery attempts are tracked on the workflow record itself, not per-step.

---

## 4. Step Configuration

**Source**: `src/step.ts`

```typescript
interface StepConfig {
  retriesAllowed?: boolean;     // Enable retries (default false)
  intervalSeconds?: number;     // Initial retry delay (default 1)
  maxAttempts?: number;         // Max retry attempts (default 3)
  backoffRate?: number;         // Backoff multiplier (default 2)
}
```

This allows per-step retry configuration, separate from workflow-level recovery.

---

## 5. Database Retry Decorator

**Source**: `src/system_database.ts`

DBOS wraps all database operations with automatic retry:

```typescript
function dbRetry(options: { initialBackoff?: number; maxBackoff?: number } = {}) {
  const { initialBackoff = 1.0, maxBackoff = 60.0 } = options;
  
  return function(target, propertyName, descriptor) {
    const method = descriptor.value!;
    descriptor.value = async function(...args) {
      let retries = 0;
      let backoff = initialBackoff;
      
      while (true) {
        try {
          return await method.apply(this, args);
        } catch (e) {
          if (retriablePostgresException(e)) {
            retries++;
            const actualBackoff = backoff * (0.5 + Math.random()); // Jitter
            await sleepms(actualBackoff * 1000);
            backoff = Math.min(backoff * 2, maxBackoff);
          } else {
            throw e;
          }
        }
      }
    };
  };
}
```

**Retryable errors** (Postgres-specific):
- Connection exceptions (SQLSTATE class `08`)
- Insufficient resources (`53`)
- Operator intervention (`57`)
- Node.js network errors: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`

---

## 6. Workflow Queue with Concurrency Control

**Source**: `src/wfqueue.ts`

```typescript
interface QueueParameters {
  workerConcurrency?: number;  // Max concurrent per worker
  concurrency?: number;        // Max concurrent globally
  rateLimit?: {
    limitPerPeriod: number;    // Max starts per period
    periodSec: number;         // Period in seconds
  };
  priorityEnabled?: boolean;
  partitionQueue?: boolean;    // Enable queue partitioning
}
```

**Queue dispatch loop**:
```typescript
async dispatchLoop(exec: DBOSExecutor): Promise<void> {
  while (this.isRunning) {
    await sleepWithInterrupt(this.pollingIntervalMs);
    
    for (const queue of this.queues) {
      try {
        const wfids = await exec.systemDatabase.findAndMarkStartableWorkflows(
          queue, executorID, appVersion
        );
        
        for (const wfid of wfids) {
          await exec.executeWorkflowUUID(wfid);
        }
        
        // Decrease polling interval on success
        this.pollingIntervalMs *= 0.9;
        
      } catch (e) {
        if (isContentionError(e)) {
          // Increase polling interval on contention
          this.pollingIntervalMs *= 2.0;
        }
      }
    }
  }
}
```

**Key insight**: Adaptive polling interval - backs off on contention, speeds up on success.

---

## 7. Find and Mark Startable Workflows (Locking)

**Source**: `src/system_database.ts`

This is the core locking mechanism (Postgres-specific):

```sql
-- Find and lock workflows to start
SELECT workflow_uuid
FROM workflow_status
WHERE status = 'ENQUEUED'
  AND queue_name = $1
  AND (application_version IS NULL OR application_version = $2)
ORDER BY priority ASC, created_at ASC
LIMIT $3
FOR UPDATE SKIP LOCKED  -- ❗ Postgres-specific
```

```sql
-- Mark as PENDING (started)
UPDATE workflow_status
SET status = 'PENDING',
    executor_id = $1,
    started_at_epoch_ms = $2,
    workflow_deadline_epoch_ms = CASE
      WHEN workflow_timeout_ms IS NOT NULL
      THEN (EXTRACT(epoch FROM now()) * 1000)::bigint + workflow_timeout_ms
      ELSE workflow_deadline_epoch_ms
    END
WHERE workflow_uuid = $3
```

---

## 8. Recovery on Startup

**Source**: `src/dbos-executor.ts`

When the executor starts, it recovers pending workflows:

```typescript
async recoverPendingWorkflows() {
  // Get all PENDING workflows for this executor and app version
  const pending = await this.systemDatabase.getPendingWorkflows(
    this.executorID, 
    globalParams.appVersion
  );
  
  for (const wf of pending) {
    await this.executeWorkflowUUID(wf.workflowUUID);
  }
}
```

**Key insight**: Workflows are tied to an executor ID. When an executor restarts, it recovers only its own pending workflows.

---

## 9. Workflow Fork (Restart from Step)

**Source**: `src/system_database.ts`

DBOS can "fork" a workflow to restart it from a specific step:

```typescript
async forkWorkflow(
  workflowID: string,
  startStep: number,
  options?: { newWorkflowID?: string; timeoutMS?: number }
): Promise<string> {
  const newWorkflowID = options?.newWorkflowID ?? randomUUID();
  
  // Copy workflow status with new ID
  await insertWorkflowStatus(client, {
    ...oldStatus,
    workflowUUID: newWorkflowID,
    status: StatusString.ENQUEUED,
    forkedFrom: workflowID,
  });
  
  // Copy step results up to startStep
  if (startStep > 0) {
    await client.query(`
      INSERT INTO operation_outputs 
        (workflow_uuid, function_id, output, error, ...)
      SELECT $1, function_id, output, error, ...
      FROM operation_outputs
      WHERE workflow_uuid = $2 AND function_id < $3
    `, [newWorkflowID, workflowID, startStep]);
  }
  
  return newWorkflowID;
}
```

**Key insight**: By copying step results, the forked workflow replays from the copied state.

---

## 10. Database-Agnostic Adaptations Needed

Since DBOS is Postgres-only, we need abstractions for multi-database support:

### 10.1 Row Locking

| Database | Approach |
|----------|----------|
| PostgreSQL | `FOR UPDATE SKIP LOCKED` |
| MySQL | `FOR UPDATE SKIP LOCKED` (8.0+) |
| SQLite | No row-level locking - use application-level locks |

**Abstraction**:
```typescript
interface LockStrategy {
  acquireLock(executionId: string): Promise<boolean>;
  releaseLock(executionId: string): Promise<void>;
  // Returns locked_until column approach for SQLite
}
```

### 10.2 LISTEN/NOTIFY

| Database | Approach |
|----------|----------|
| PostgreSQL | `LISTEN/NOTIFY` |
| MySQL | Polling or external pub/sub |
| SQLite | Polling only |

**Abstraction**: Use polling as default, with optional pub/sub backends.

### 10.3 Upsert Syntax

| Database | Syntax |
|----------|--------|
| PostgreSQL | `ON CONFLICT DO UPDATE` |
| MySQL | `ON DUPLICATE KEY UPDATE` |
| SQLite | `ON CONFLICT DO UPDATE` |

**Abstraction**: Query builder or raw SQL per dialect.

### 10.4 Timestamp Functions

| Database | NOW() | Epoch MS |
|----------|-------|----------|
| PostgreSQL | `NOW()` | `EXTRACT(epoch FROM now()) * 1000` |
| MySQL | `NOW()` | `UNIX_TIMESTAMP() * 1000` |
| SQLite | `datetime('now')` | `strftime('%s','now') * 1000` |

---

## Summary: Key Differences

| Aspect | DBOS | Durable Package | Needed for vibecoding-toolkit |
|--------|------|-----------------|-------------------------------|
| Database | Postgres only | Postgres only | Multi-DB (SQLite, MySQL, Postgres) |
| Locking | `FOR UPDATE SKIP LOCKED` | DB-level locks | Abstracted lock strategy |
| Notifications | `LISTEN/NOTIFY` | Not used | Polling (with optional pub/sub) |
| Recovery | Per-executor | Per-execution | Per-execution |
| Step tracking | `function_id` counter | Event history | Similar to DBOS approach |
| Max retries | 100 (workflow level) | 20 (via alarm) | Configurable per-workflow |
| Queue | Native with rate limits | Not built-in | Queue with rate/concurrency limits |

