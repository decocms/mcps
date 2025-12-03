# Patterns from Durable Package

> Quick reference of key patterns from `packages/durable` to adopt in vibecoding-toolkit workflows.

---

## 1. Worker Pattern (Producer-Consumer)

**Source**: `packages/durable/workers/worker.ts`

The durable package uses a clean producer-consumer pattern with explicit success/error handlers:

```typescript
interface WorkItem<T, TResult = unknown> {
  item: T;
  onSuccess: (r: TResult) => Promise<void>;
  onError: (err: unknown) => Promise<void>;
}
```

**Key insight**: Each work item carries its own cleanup/retry logic, ensuring errors in one item don't affect others.

### How it works:

```typescript
// Producer yields work items
for (const { execution: item, unlock } of executionIds) {
  yield {
    item,
    onError: async (err) => {
      await unlock();  // Release lock so retry can acquire it
      throw err;
    },
    onSuccess: unlock,  // Release lock on success
  };
}

// Consumer processes items
try {
  await handler(recv.item).then(recv.onSuccess).catch(recv.onError);
} catch (e) {
  console.error("WORKER ERROR", e);
  // Error is contained - doesn't crash the consumer loop
}
```

---

## 2. Execution Locking

**Source**: `packages/durable/backends/backend.ts`

```typescript
interface PendingExecution {
  execution: string;
  unlock: () => Promise<void>;  // Callback to release lock
}

interface DB {
  pendingExecutions(
    lockTimeMS: number,  // How long to hold the lock
    limit: number,       // Max executions to lock
  ): Promise<PendingExecution[]>;
}
```

**Key insight**: Lock is acquired when fetching pending executions, not as a separate step. The `unlock` callback is tied to the specific execution.

---

## 3. Retry with Exponential Backoff

**Source**: `packages/durable/src/workflow.ts`

```typescript
const MAX_RETRY_COUNT = 20;
const MAXIMUM_BACKOFF_SECONDS = 64;

onHandleError(allowUnconfirmed = false) {
  return async (err: any) => {
    const retryCount = await this.addRetries(allowUnconfirmed);
    
    // Stop after max retries
    if (retryCount >= MAX_RETRY_COUNT) {
      console.log(`workflow ${id} has reached maximum retry count`);
      await this.zeroRetries(allowUnconfirmed);
      return;
    }
    
    // Exponential backoff with jitter
    const jitter = (Math.floor(Math.random() * 2)) + 1; // 1-3s
    const inSeconds = Math.min(
      (2 ^ retryCount) + jitter,
      MAXIMUM_BACKOFF_SECONDS
    );
    
    // Schedule retry via alarm
    await this.state.storage.setAlarm(
      secondsFromNow(inSeconds),
      { allowUnconfirmed }
    );
  };
}
```

**Key insights**:
- Retry count persisted to storage (`addRetries`)
- Zero retries on success (`zeroRetries`)
- Uses Durable Object alarms for scheduling

---

## 4. Event Sourcing

**Source**: `packages/durable/runtime/core/workflow.ts`

State is reconstructed by replaying events:

```typescript
// Load history and pending events
const [history, pendingEvents] = await Promise.all([
  execution.history.get(),
  execution.pending.get(),
]);

// Reconstruct state by applying events
let state: WorkflowState = [
  ...history,
  ...pendingEvents,
].reduce(apply, zeroState(workflowFn));
```

**Key insight**: The workflow can resume from any point by replaying events. No need to persist intermediate state.

---

## 5. Transaction Wrapper

**Source**: `packages/durable/backends/backend.ts`

```typescript
interface Execution {
  withinTransaction<T>(
    f: (transactor: Execution) => PromiseOrValue<T>,
  ): Promise<T>;
}
```

Usage:
```typescript
return clientDb.withinTransaction(async (executionDB) => {
  const instance = await executionDB.get();
  // ... all operations in transaction ...
  // Automatically commits on success, rolls back on error
});
```

**Key insight**: Atomic operations prevent partial state updates.

---

## 6. Success Handler with Next Step Scheduling

**Source**: `packages/durable/src/workflow.ts`

```typescript
onHandleSuccess(allowUnconfirmed = false) {
  return async () => {
    const [pending, isCompleted, _] = await Promise.all([
      this.execution.pending.get(),
      this.isCompleted(),
      this.zeroRetries(allowUnconfirmed),  // Reset retry count
    ]);
    
    // Find next pending event
    const next = pending.sort(sortHistoryEventByDate)[0];
    
    if (next === undefined) {
      if (!isCompleted) {
        // Safety: schedule retry in case events arrive
        await this.scheduleRetry(allowUnconfirmed);
      } else {
        // Done - cancel any pending alarms
        await this.state.storage.deleteAlarm({ allowUnconfirmed });
      }
    } else if (next.visibleAt) {
      // Schedule for specific time
      await this.state.storage.setAlarm(new Date(next.visibleAt).getTime());
    } else {
      // Execute soon
      await this.scheduleRetry(allowUnconfirmed);
    }
  };
}
```

**Key insights**:
- Always reset retry count on success
- Check for completion before scheduling
- Support for delayed/scheduled events (`visibleAt`)

---

## 7. Alarm-Based Scheduling

**Source**: `packages/durable/src/workflow.ts`

Uses Durable Object alarms for reliable scheduling:

```typescript
// Schedule retry in 15 seconds
async scheduleRetry(allowUnconfirmed = false) {
  await this.state.storage.setAlarm(
    secondsFromNow(15),
    { allowUnconfirmed }
  );
}

// Alarm handler
async alarm() {
  try {
    await this.handler();
  } finally {
    console.log(`alarm for execution ${this.workflowExecution?.id!}`);
  }
}
```

**For vibecoding-toolkit**: We use Cloudflare Queues instead, but the pattern is similar - use `message.retry({ delaySeconds })` for scheduling.

---

## 8. Workflow Status State Machine

**Source**: `packages/durable/backends/backend.ts`

```typescript
type WorkflowStatus =
  | "completed"
  | "canceled"
  | "sleeping"
  | "running";

const WORKFLOW_NOT_COMPLETED: WorkflowStatus[] = [
  "running",
  "sleeping",
];
```

**Key insight**: Only process executions that are not completed. Check status before and after execution.

---

## 9. Safety Guard Pattern

**Source**: `packages/durable/src/workflow.ts`

```typescript
async (req: Request) => {
  const body: { events: HistoryEvent[] } = await req.json();
  await Promise.all([
    wkflow.execution.pending.add(...body.events),
    wkflow.scheduleRetry(),  // ← Safety guard!
  ]);
  wkflow.state.waitUntil(wkflow.handler(true));
  return new Response(JSON.stringify({}), { status: 200 });
}
```

**Key insight**: When adding new events, always schedule a retry alarm as a safety guard. This ensures the workflow will execute even if the immediate `handler()` call fails.

---

## Summary: Key Differences to Address

| Aspect | Durable Package | vibecoding-toolkit |
|--------|-----------------|-------------------|
| Error isolation | Per-item handlers | None (loop exits) |
| Retry tracking | Persisted counter | Not tracked |
| Lock mechanism | Database with unlock callback | None |
| State reconstruction | Event sourcing | Direct DB read |
| Transaction | `withinTransaction` wrapper | Separate queries |
| Next step scheduling | On success handler | In try block |
| Safety retries | Always scheduled | None |








