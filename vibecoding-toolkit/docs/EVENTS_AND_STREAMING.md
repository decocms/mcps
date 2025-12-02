# Events System & Streaming Implementation Guide

This document describes the events architecture and streaming implementation for the vibecoding-toolkit workflow engine.

## Overview

The workflow engine uses a **hybrid approach**:

| Concern | Storage | Purpose |
|---------|---------|---------|
| **Step Checkpoints** | `execution_step_results` | Fast reads for replay, step-level durability |
| **Workflow Events** | `workflow_events` | Signals, timers, messages, observability |
| **Streaming** | Tee stream + background checkpoint | Real-time client streaming with durability |

This design is inspired by:
- **DBOS**: Database as source of truth, `send()`/`recv()` messaging
- **deco-cx/durable**: Event-based coordination with `visible_at` for timers

---

## Part 1: Events Table Schema

### Migration

```sql
-- Create unified events table
CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  
  -- Event classification
  type TEXT NOT NULL CHECK(type IN (
    'signal',           -- External signal (human-in-the-loop)
    'timer',            -- Durable sleep wake-up
    'message',          -- Inter-workflow communication (send/recv)
    'output',           -- Published value (setEvent/getEvent)
    'step_started',     -- Observability: step began
    'step_completed',   -- Observability: step finished
    'workflow_started', -- Workflow began execution
    'workflow_completed' -- Workflow finished
  )),
  
  -- Event data
  name TEXT,              -- Signal name, step name, topic, or event key
  payload TEXT,           -- JSON payload
  
  -- Timing
  created_at INTEGER NOT NULL,
  visible_at INTEGER,     -- For delayed visibility (timers, scheduled messages)
  consumed_at INTEGER,    -- When processed (NULL = pending)
  
  -- Inter-workflow messaging
  source_execution_id TEXT,  -- Which execution sent this (for recv pattern)
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_events_pending 
  ON workflow_events(execution_id, type, consumed_at, visible_at) 
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_by_name 
  ON workflow_events(execution_id, type, name) 
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_output 
  ON workflow_events(execution_id, name) 
  WHERE type = 'output';

-- Unique constraint for setEvent/getEvent (upsert pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_output_unique 
  ON workflow_events(execution_id, type, name) 
  WHERE type = 'output';

-- For inter-workflow message lookup
CREATE INDEX IF NOT EXISTS idx_events_source 
  ON workflow_events(source_execution_id) 
  WHERE source_execution_id IS NOT NULL;
```

### Drop Old Signals Table (if migrating)

```sql
-- Migrate existing signals first
INSERT INTO workflow_events (id, execution_id, type, name, payload, created_at, consumed_at)
SELECT id, execution_id, 'signal', signal_name, payload, created_at, consumed_at
FROM workflow_signals
WHERE NOT EXISTS (SELECT 1 FROM workflow_events WHERE workflow_events.id = workflow_signals.id);

-- Then drop
DROP TABLE IF EXISTS workflow_signals;
```

---

## Part 2: Events API Implementation

### Types

```typescript
// workflow/events.ts

import { z } from "zod";
import type { Env } from "../main.ts";

export const EventTypeEnum = z.enum([
  'signal',
  'timer', 
  'message',
  'output',
  'step_started',
  'step_completed',
  'workflow_started',
  'workflow_completed',
]);

export type EventType = z.infer<typeof EventTypeEnum>;

export const WorkflowEventSchema = z.object({
  id: z.string(),
  execution_id: z.string(),
  type: EventTypeEnum,
  name: z.string().optional(),
  payload: z.unknown().optional(),
  created_at: z.number(),
  visible_at: z.number().optional(),
  consumed_at: z.number().optional(),
  source_execution_id: z.string().optional(),
});

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
```

### Core Functions

```typescript
// workflow/events.ts (continued)

/**
 * Add an event to the workflow events table
 */
export async function addEvent(
  env: Env,
  event: Omit<WorkflowEvent, 'id' | 'created_at'> & { created_at?: number },
): Promise<WorkflowEvent> {
  const id = crypto.randomUUID();
  const created_at = event.created_at ?? Date.now();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_events 
      (id, execution_id, type, name, payload, created_at, visible_at, source_execution_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    params: [
      id,
      event.execution_id,
      event.type,
      event.name ?? null,
      event.payload ? JSON.stringify(event.payload) : null,
      created_at,
      event.visible_at ?? null,
      event.source_execution_id ?? null,
    ],
  });

  return { ...event, id, created_at } as WorkflowEvent;
}

/**
 * Get pending events for an execution (visible and unconsumed)
 */
export async function getPendingEvents(
  env: Env,
  executionId: string,
  type?: EventType,
): Promise<WorkflowEvent[]> {
  const now = Date.now();
  
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_events
      WHERE execution_id = $1 
        AND consumed_at IS NULL
        AND (visible_at IS NULL OR visible_at <= $2)
        ${type ? 'AND type = $3' : ''}
      ORDER BY visible_at ASC NULLS FIRST, created_at ASC
    `,
    params: type ? [executionId, now, type] : [executionId, now],
  });

  return (result.result[0]?.results || []).map(transformEvent);
}

/**
 * Consume an event (mark as processed)
 */
export async function consumeEvent(
  env: Env,
  executionId: string,
  type: EventType,
  name?: string,
): Promise<WorkflowEvent | null> {
  const now = Date.now();

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_events
      SET consumed_at = $1
      WHERE id = (
        SELECT id FROM workflow_events
        WHERE execution_id = $2 
          AND type = $3 
          ${name ? 'AND name = $4' : ''}
          AND consumed_at IS NULL
          AND (visible_at IS NULL OR visible_at <= $1)
        ORDER BY visible_at ASC NULLS FIRST, created_at ASC
        LIMIT 1
      )
      RETURNING *
    `,
    params: name ? [now, executionId, type, name] : [now, executionId, type],
  });

  const row = result.result[0]?.results?.[0];
  return row ? transformEvent(row) : null;
}

/**
 * Transform DB row to WorkflowEvent
 */
function transformEvent(row: Record<string, unknown>): WorkflowEvent {
  return {
    id: row.id as string,
    execution_id: row.execution_id as string,
    type: row.type as EventType,
    name: row.name as string | undefined,
    payload: row.payload ? JSON.parse(row.payload as string) : undefined,
    created_at: row.created_at as number,
    visible_at: row.visible_at as number | undefined,
    consumed_at: row.consumed_at as number | undefined,
    source_execution_id: row.source_execution_id as string | undefined,
  };
}
```

---

## Part 3: Signal API (Human-in-the-Loop)

```typescript
// workflow/events.ts (continued)

/**
 * Send a signal to a workflow execution.
 * 
 * Signals are used for human-in-the-loop patterns:
 * - Approval workflows
 * - Manual data entry
 * - External webhook triggers
 */
export async function sendSignal(
  env: Env,
  executionId: string,
  signalName: string,
  payload?: unknown,
  options?: {
    /** Re-queue execution after sending signal (default: true) */
    wakeExecution?: boolean;
  },
): Promise<WorkflowEvent> {
  const event = await addEvent(env, {
    execution_id: executionId,
    type: 'signal',
    name: signalName,
    payload,
    visible_at: Date.now(), // Immediately visible
  });

  // Wake up the execution if requested
  if (options?.wakeExecution !== false) {
    await wakeExecution(env, executionId);
  }

  return event;
}

/**
 * Wait for a signal (called from step executor)
 * 
 * Returns the signal event if available, null otherwise.
 * The step should throw WaitingForSignalError if null.
 */
export async function waitForSignal(
  env: Env,
  executionId: string,
  signalName: string,
): Promise<WorkflowEvent | null> {
  return consumeEvent(env, executionId, 'signal', signalName);
}
```

---

## Part 4: Timer API (Durable Sleep)

```typescript
// workflow/events.ts (continued)

/**
 * Schedule a timer event for durable sleep.
 * 
 * The timer won't be visible until wakeAtEpochMs, allowing
 * the scheduler to pick up the execution at the right time.
 */
export async function scheduleTimer(
  env: Env,
  executionId: string,
  stepName: string,
  wakeAtEpochMs: number,
): Promise<WorkflowEvent> {
  return addEvent(env, {
    execution_id: executionId,
    type: 'timer',
    name: stepName,
    payload: { wakeAt: wakeAtEpochMs },
    visible_at: wakeAtEpochMs, // Not visible until wake time
  });
}

/**
 * Check if a timer is ready (called from step executor)
 */
export async function checkTimer(
  env: Env,
  executionId: string,
  stepName: string,
): Promise<WorkflowEvent | null> {
  return consumeEvent(env, executionId, 'timer', stepName);
}
```

---

## Part 5: Inter-Workflow Messaging (DBOS-style send/recv)

```typescript
// workflow/events.ts (continued)

/**
 * Send a message to another workflow execution.
 * 
 * This enables the DBOS-style send/recv pattern for
 * workflow coordination and fan-out/fan-in.
 */
export async function sendMessage(
  env: Env,
  sourceExecutionId: string,
  targetExecutionId: string,
  topic: string,
  payload?: unknown,
): Promise<WorkflowEvent> {
  const event = await addEvent(env, {
    execution_id: targetExecutionId,
    type: 'message',
    name: topic,
    payload,
    source_execution_id: sourceExecutionId,
    visible_at: Date.now(),
  });

  // Wake the target execution
  await wakeExecution(env, targetExecutionId);

  return event;
}

/**
 * Receive a message (poll for one).
 * 
 * Returns null if no message is available.
 * The workflow should yield and retry later.
 */
export async function receiveMessage(
  env: Env,
  executionId: string,
  topic: string,
): Promise<WorkflowEvent | null> {
  return consumeEvent(env, executionId, 'message', topic);
}
```

---

## Part 6: Published Events (setEvent/getEvent)

```typescript
// workflow/events.ts (continued)

/**
 * Publish an output event (for external observers).
 * 
 * This is an upsert - updates the value if key already exists.
 * Useful for exposing workflow state to external systems.
 */
export async function setEvent(
  env: Env,
  executionId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const now = Date.now();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_events (id, execution_id, type, name, payload, created_at, visible_at)
      VALUES ($1, $2, 'output', $3, $4, $5, $5)
      ON CONFLICT (execution_id, type, name) WHERE type = 'output'
      DO UPDATE SET payload = $4, created_at = $5
    `,
    params: [crypto.randomUUID(), executionId, key, JSON.stringify(value), now],
  });
}

/**
 * Get a published event value.
 * 
 * Returns null if the key doesn't exist yet.
 * External systems can poll this or the workflow can wait.
 */
export async function getEvent(
  env: Env,
  executionId: string,
  key: string,
): Promise<unknown | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT payload FROM workflow_events 
      WHERE execution_id = $1 AND type = 'output' AND name = $2
    `,
    params: [executionId, key],
  });

  const row = result.result[0]?.results?.[0] as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : null;
}
```

---

## Part 7: Wake Execution Helper

```typescript
// workflow/events.ts (continued)

/**
 * Wake an execution for processing.
 * 
 * Uses the queue if available, otherwise just updates timestamp
 * for polling-based schedulers.
 */
export async function wakeExecution(
  env: Env,
  executionId: string,
  options?: { delayMs?: number },
): Promise<void> {
  // Update timestamp (for polling schedulers)
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `UPDATE workflow_executions SET updated_at = $1 WHERE id = $2`,
    params: [Date.now(), executionId],
  });

  // Use queue if available (preferred for CF Workers)
  if (env.WORKFLOW_QUEUE) {
    const { createScheduler } = await import('../lib/scheduler.ts');
    const scheduler = createScheduler(env.WORKFLOW_QUEUE);
    
    if (options?.delayMs) {
      await scheduler.scheduleAfter(executionId, options.delayMs, {
        authorization: env.DECO_REQUEST_CONTEXT.token,
      });
    } else {
      await scheduler.schedule(executionId, {
        authorization: env.DECO_REQUEST_CONTEXT.token,
      });
    }
  }
}
```

---

## Part 8: Streaming Implementation (Option 4 - Tee Stream)

### Types

```typescript
// workflow/types.ts (add these)

/** Result when a step returns a stream */
export interface StreamingStepResult {
  /** The stream to pass to the client */
  stream: ReadableStream<Uint8Array>;
  
  /** Promise that resolves when buffering + checkpoint completes */
  onComplete: Promise<{
    output: string;
    completedAt: number;
  }>;
  
  /** Step metadata */
  stepName: string;
  startedAt: number;
}

/** Check if result is streaming */
export function isStreamingResult(
  result: StepExecutionResult | StreamingStepResult
): result is StreamingStepResult {
  return 'stream' in result && result.stream instanceof ReadableStream;
}
```

### Streaming Step Executor

```typescript
// workflow/step-executors.ts

import type { StreamingStepResult, StepExecutionResult } from './types.ts';
import { updateStepResult, getStepResult } from '../lib/execution-db.ts';

/**
 * Execute a tool step that may return a stream.
 * 
 * If the tool returns a stream:
 * 1. Tee the stream (one for client, one for buffering)
 * 2. Return the client stream immediately
 * 3. Buffer chunks in background
 * 4. Checkpoint the full result when stream completes
 */
export async function executeToolStep(
  env: Env,
  step: Step,
  input: Record<string, unknown>,
  executionId: string,
): Promise<StepExecutionResult | StreamingStepResult> {
  const startedAt = Date.now();

  // Check for cached result (replay scenario)
  const existing = await getStepResult(env, executionId, step.name);
  if (existing?.completed_at_epoch_ms && existing?.output) {
    return {
      output: existing.output,
      startedAt: existing.started_at_epoch_ms || startedAt,
      completedAt: existing.completed_at_epoch_ms,
    };
  }

  // Parse tool action
  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error('Tool step missing tool configuration');
  }

  const { connectionId, toolName } = parsed.data;
  const connection = createProxyConnection(connectionId, {
    workspace: env.DECO_WORKSPACE,
    token: env.DECO_REQUEST_CONTEXT.token,
  });

  // Execute the tool
  const result = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
    connection: connection as any,
    params: { name: toolName, arguments: input },
  }) as { 
    structuredContent?: unknown; 
    content?: string; 
    stream?: ReadableStream<Uint8Array>;
  };

  // Non-streaming response
  if (!result.stream) {
    const output = result.structuredContent || result.content;
    const completedAt = Date.now();
    
    await updateStepResult(env, executionId, step.name, {
      output,
      completed_at_epoch_ms: completedAt,
    });

    return { output, startedAt, completedAt };
  }

  // Streaming response - tee the stream
  const [clientStream, bufferStream] = result.stream.tee();

  const onComplete = (async () => {
    const chunks: Uint8Array[] = [];
    const reader = bufferStream.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks into final output
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const output = new TextDecoder().decode(combined);
      const completedAt = Date.now();

      // Checkpoint the final result
      await updateStepResult(env, executionId, step.name, {
        output,
        completed_at_epoch_ms: completedAt,
      });

      return { output, completedAt };
    } finally {
      reader.releaseLock();
    }
  })();

  return {
    stream: clientStream,
    onComplete,
    stepName: step.name,
    startedAt,
  };
}
```

### Executor Integration

```typescript
// workflow/executor.ts (modify executeStepWithCheckpoint)

import { isStreamingResult, type StreamingStepResult } from './types.ts';

async function executeStepWithCheckpoint(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<StepExecutionResult | StreamingStepResult> {
  // Check for cached result
  const existing = await getStepResult(env, executionId, step.name);
  if (existing?.completed_at_epoch_ms && existing?.output) {
    if (verbose) console.log(`[${step.name}] Replaying cached output`);
    return {
      output: existing.output,
      startedAt: existing.started_at_epoch_ms || Date.now(),
      completedAt: existing.completed_at_epoch_ms,
    };
  }

  // Create step record
  const { result: stepRecord, created } = await createStepResult(env, {
    execution_id: executionId,
    step_id: step.name,
    started_at_epoch_ms: Date.now(),
  });

  // Handle race condition
  if (!created && stepRecord.completed_at_epoch_ms && stepRecord.output) {
    return {
      output: stepRecord.output,
      startedAt: stepRecord.started_at_epoch_ms || Date.now(),
      completedAt: stepRecord.completed_at_epoch_ms,
    };
  }

  // Resolve input refs
  const input = (stepRecord.input ?? step.input ?? {}) as Record<string, unknown>;
  const { resolved: resolvedInput, errors } = resolveAllRefs(input, ctx);
  if (errors) {
    throw new Error(`Failed to resolve input: ${errors.map(e => e.error).join(', ')}`);
  }

  // Execute the step
  const result = await executeStep(
    env, step, resolvedInput as Record<string, unknown>, 
    ctx, executionId, stepRecord
  );

  // Streaming result - don't await checkpoint, return stream immediately
  if (isStreamingResult(result)) {
    return result;
  }

  // Normal result - checkpoint synchronously
  await updateStepResult(env, executionId, step.name, {
    output: result.output,
    error: result.error,
    completed_at_epoch_ms: result.completedAt,
  });

  return result;
}
```

### Phase Execution with Streaming

```typescript
// workflow/executor.ts (modify executePhase)

async function executePhase(
  env: Env,
  phase: Step[],
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<{
  stepResults: Record<string, StepExecutionResult>;
  streamingSteps: StreamingStepResult[];
}> {
  const results = await Promise.allSettled(
    phase.map(step => executeStepWithCheckpoint(env, step, ctx, executionId, verbose))
  );

  const stepResults: Record<string, StepExecutionResult> = {};
  const streamingSteps: StreamingStepResult[] = [];

  for (let i = 0; i < phase.length; i++) {
    const step = phase[i];
    const result = results[i];

    if (result.status === 'rejected') {
      // Handle errors as before...
      continue;
    }

    if (isStreamingResult(result.value)) {
      // Collect streaming results
      streamingSteps.push(result.value);
      continue;
    }

    stepResults[step.name] = result.value;
  }

  return { stepResults, streamingSteps };
}
```

### Returning Streams to Client

```typescript
// workflow/executor.ts (new helper)

/**
 * Create a multiplexed stream from multiple streaming steps.
 * 
 * Each chunk is prefixed with the step name for client demuxing.
 */
export function createMultiplexedStream(
  streamingSteps: StreamingStepResult[]
): { stream: ReadableStream; onAllComplete: Promise<void> } {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const onAllComplete = (async () => {
    const readers = streamingSteps.map(s => ({
      stepName: s.stepName,
      reader: s.stream.getReader(),
      onComplete: s.onComplete,
    }));

    // Read from all streams concurrently
    const readPromises = readers.map(async ({ stepName, reader }) => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          // Format: stepName:base64data\n
          const chunk = `${stepName}:${btoa(String.fromCharCode(...value))}\n`;
          await writer.write(encoder.encode(chunk));
        }
        
        // Signal step completion
        await writer.write(encoder.encode(`${stepName}:__DONE__\n`));
      } finally {
        reader.releaseLock();
      }
    });

    await Promise.all(readPromises);
    
    // Wait for all checkpoints to complete
    await Promise.all(streamingSteps.map(s => s.onComplete));
    
    await writer.close();
  })();

  return { stream: readable, onAllComplete };
}
```

---

## Part 9: Event Streaming Endpoint (SSE)

```typescript
// server/routes/stream.ts

import { getPendingEvents, type WorkflowEvent } from '../workflow/events.ts';
import { getExecution } from '../lib/execution-db.ts';

/**
 * Stream workflow events using Server-Sent Events (SSE).
 * 
 * Clients connect to this endpoint to watch workflow progress in real-time.
 */
export async function streamWorkflowEvents(
  env: Env,
  executionId: string,
  request: Request,
): Promise<Response> {
  const sentIds = new Set<string>();
  let lastSeenAt = 0;

  async function* eventGenerator() {
    while (true) {
      if (request.signal.aborted) break;

      // Fetch all events (not just pending) for streaming
      const events = await getAllEventsAfter(env, executionId, lastSeenAt);
      
      for (const event of events) {
        if (!sentIds.has(event.id)) {
          sentIds.add(event.id);
          lastSeenAt = Math.max(lastSeenAt, event.created_at);
          yield event;
        }
      }

      // Check if execution is complete
      const execution = await getExecution(env, executionId);
      if (execution?.status === 'completed' || execution?.status === 'cancelled') {
        yield { type: 'execution_complete', status: execution.status };
        break;
      }

      // Poll interval
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Create SSE stream
  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  (async () => {
    try {
      for await (const event of eventGenerator()) {
        const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
        await writer.write(encoder.encode(sseMessage));
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function getAllEventsAfter(
  env: Env, 
  executionId: string, 
  afterTimestamp: number
): Promise<WorkflowEvent[]> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_events
      WHERE execution_id = $1 AND created_at > $2
      ORDER BY created_at ASC
      LIMIT 100
    `,
    params: [executionId, afterTimestamp],
  });

  return (result.result[0]?.results || []).map(transformEvent);
}
```

---

## Part 10: Usage Examples

### Sending a Signal (Human Approval)

```typescript
// In an API route or webhook handler
await sendSignal(env, executionId, 'approval', { 
  approved: true, 
  approvedBy: 'user@example.com' 
});
```

### Waiting for Signal in a Step

```typescript
// In step-executors.ts for waitForSignal step type
const signal = await waitForSignal(env, executionId, signalName);

if (!signal) {
  // No signal yet - pause execution
  throw new WaitingForSignalError(executionId, stepName, signalName);
}

// Signal received - continue with payload
return { output: signal.payload };
```

### Durable Sleep

```typescript
// In step-executors.ts for sleep step type
const timer = await checkTimer(env, executionId, stepName);

if (timer) {
  // Timer fired - continue
  return { slept: true, sleepDurationMs: Date.now() - startedAt };
}

// Not ready - schedule timer and pause
await scheduleTimer(env, executionId, stepName, wakeAtEpochMs);
return { slept: false, wakeAtEpochMs };
```

### Inter-Workflow Communication

```typescript
// Parent workflow sends data to child
await sendMessage(env, parentExecutionId, childExecutionId, 'process_result', {
  items: processedItems,
});

// Child workflow receives
const message = await receiveMessage(env, childExecutionId, 'process_result');
if (!message) {
  // Wait for message
  throw new WaitingForMessageError(...);
}
```

### Publishing Progress (External Observer)

```typescript
// In executor, after each phase
await setEvent(env, executionId, 'progress', {
  currentPhase: phaseIndex,
  totalPhases: phases.length,
  completedSteps: Object.keys(stepOutputs),
});

// External system reads progress
const progress = await getEvent(env, executionId, 'progress');
```

### Client Streaming

```typescript
// Client-side JavaScript
const eventSource = new EventSource(`/api/executions/${id}/stream`);

eventSource.onmessage = (e) => {
  const event = JSON.parse(e.data);
  
  switch (event.type) {
    case 'step_started':
      console.log(`Step ${event.name} started`);
      break;
    case 'step_completed':
      console.log(`Step ${event.name} completed:`, event.payload);
      break;
    case 'execution_complete':
      console.log('Workflow finished:', event.status);
      eventSource.close();
      break;
  }
};
```

---

## Summary

| Feature | Implementation |
|---------|---------------|
| **Signals** | `sendSignal()` / `waitForSignal()` via events table |
| **Timers** | `scheduleTimer()` / `checkTimer()` with `visible_at` |
| **Messages** | `sendMessage()` / `receiveMessage()` for inter-workflow |
| **Output** | `setEvent()` / `getEvent()` for external observers |
| **Step Streaming** | Tee stream + background checkpoint (Option 4) |
| **Event Streaming** | SSE endpoint with DB polling |
| **Wake Execution** | Queue (preferred) or DB update for polling |

This hybrid approach gives you:
- ✅ Database as source of truth (DBOS pattern)
- ✅ Step-level durability via checkpoints
- ✅ Real-time streaming to clients
- ✅ Inter-workflow communication
- ✅ External observability
- ✅ Works with or without external queue





