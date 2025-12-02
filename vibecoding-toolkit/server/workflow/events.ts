/**
 * Workflow Events API
 *
 * Unified events system for signals, timers, messages, and observability.
 * Inspired by DBOS send/recv patterns and deco-cx/durable visible_at.
 *
 * @see docs/EVENTS_AND_STREAMING.md
 */

import type { Env } from "../main.ts";
import { transformDbRowToEvent } from "../collections/workflow.ts";
import { ensureTable } from "../lib/postgres.ts";
import { createQStashScheduler, type Scheduler } from "./scheduler.ts";
import { WorkflowEvent, type EventType } from "@decocms/bindings/workflow";

// ============================================================================
// Core Event Functions
// ============================================================================

/**
 * Add an event to the workflow events table
 */
export async function addEvent(
  env: Env,
  event: Omit<WorkflowEvent, "id" | "created_at"> & { created_at?: number },
): Promise<WorkflowEvent> {
  await ensureTable(env, "workflow_events");

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
  await ensureTable(env, "workflow_events");

  const now = Date.now();

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_events
      WHERE execution_id = $1 
        AND consumed_at IS NULL
        AND (visible_at IS NULL OR visible_at <= $2)
        ${type ? "AND type = $3" : ""}
      ORDER BY visible_at ASC NULLS FIRST, created_at ASC
    `,
    params: type ? [executionId, now, type] : [executionId, now],
  });

  return ((result.result[0]?.results || []) as Record<string, unknown>[]).map(
    transformDbRowToEvent,
  );
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
  await ensureTable(env, "workflow_events");

  const now = Date.now();

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_events
      SET consumed_at = $1
      WHERE id = (
        SELECT id FROM workflow_events
        WHERE execution_id = $2 
          AND type = $3 
          ${name ? "AND name = $4" : ""}
          AND consumed_at IS NULL
          AND (visible_at IS NULL OR visible_at <= $1)
        ORDER BY visible_at ASC NULLS FIRST, created_at ASC
        LIMIT 1
      )
      RETURNING *
    `,
    params: name ? [now, executionId, type, name] : [now, executionId, type],
  });

  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? transformDbRowToEvent(row) : null;
}

/**
 * Get all events after a timestamp (for streaming)
 */
export async function getAllEventsAfter(
  env: Env,
  executionId: string,
  afterTimestamp: number,
): Promise<WorkflowEvent[]> {
  await ensureTable(env, "workflow_events");

  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      SELECT * FROM workflow_events
      WHERE execution_id = $1 AND created_at > $2
      ORDER BY created_at ASC
      LIMIT 100
    `,
    params: [executionId, afterTimestamp],
  });

  return ((result.result[0]?.results || []) as Record<string, unknown>[]).map(
    transformDbRowToEvent,
  );
}

// ============================================================================
// Signal API (Human-in-the-Loop)
// ============================================================================

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
    /** Authorization token for re-queuing */
    authorization?: string;
    /** Optional scheduler (will be created from env if not provided) */
    scheduler?: Scheduler;
  },
): Promise<WorkflowEvent> {
  const event = await addEvent(env, {
    execution_id: executionId,
    type: "signal",
    name: signalName,
    payload,
    visible_at: Date.now(), // Immediately visible
  });

  // Wake up the execution if requested
  if (options?.wakeExecution !== false) {
    await wakeExecution(env, executionId, {
      authorization: options?.authorization,
      scheduler: options?.scheduler,
    });
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
  return consumeEvent(env, executionId, "signal", signalName);
}

// ============================================================================
// Timer API (Durable Sleep)
// ============================================================================

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
    type: "timer",
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
  return consumeEvent(env, executionId, "timer", stepName);
}

// ============================================================================
// Inter-Workflow Messaging (DBOS-style send/recv)
// ============================================================================

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
  options?: {
    authorization?: string;
    scheduler?: Scheduler;
  },
): Promise<WorkflowEvent> {
  const event = await addEvent(env, {
    execution_id: targetExecutionId,
    type: "message",
    name: topic,
    payload,
    source_execution_id: sourceExecutionId,
    visible_at: Date.now(),
  });

  // Wake the target execution
  await wakeExecution(env, targetExecutionId, options);

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
  return consumeEvent(env, executionId, "message", topic);
}

// ============================================================================
// Published Events (setEvent/getEvent)
// ============================================================================

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
  await ensureTable(env, "workflow_events");

  const now = Date.now();
  const id = crypto.randomUUID();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_events (id, execution_id, type, name, payload, created_at, visible_at)
      VALUES ($1, $2, 'output', $3, $4, $5, $5)
      ON CONFLICT (execution_id, type, name) WHERE type = 'output'
      DO UPDATE SET payload = $4, created_at = $5
    `,
    params: [id, executionId, key, JSON.stringify(value), now],
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
  await ensureTable(env, "workflow_events");

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

// ============================================================================
// Observability Events
// ============================================================================

/**
 * Record a step started event
 */
export async function recordStepStarted(
  env: Env,
  executionId: string,
  stepName: string,
  input?: unknown,
): Promise<WorkflowEvent> {
  return addEvent(env, {
    execution_id: executionId,
    type: "step_started",
    name: stepName,
    payload: input ? { input } : undefined,
    visible_at: Date.now(),
  });
}

/**
 * Record a step completed event
 */
export async function recordStepCompleted(
  env: Env,
  executionId: string,
  stepName: string,
  output?: unknown,
  error?: string,
): Promise<WorkflowEvent> {
  return addEvent(env, {
    execution_id: executionId,
    type: "step_completed",
    name: stepName,
    payload: { output, error },
    visible_at: Date.now(),
  });
}

/**
 * Record workflow started event
 */
export async function recordWorkflowStarted(
  env: Env,
  executionId: string,
  workflowId: string,
  input?: unknown,
): Promise<WorkflowEvent> {
  return addEvent(env, {
    execution_id: executionId,
    type: "workflow_started",
    name: workflowId,
    payload: input ? { input } : undefined,
    visible_at: Date.now(),
  });
}

/**
 * Record workflow completed event
 */
export async function recordWorkflowCompleted(
  env: Env,
  executionId: string,
  workflowId: string,
  output?: unknown,
  error?: string,
): Promise<WorkflowEvent> {
  return addEvent(env, {
    execution_id: executionId,
    type: "workflow_completed",
    name: workflowId,
    payload: { output, error },
    visible_at: Date.now(),
  });
}

// ============================================================================
// Wake Execution Helper
// ============================================================================

/**
 * Wake an execution for processing.
 *
 * Uses the queue if available, otherwise just updates timestamp
 * for polling-based schedulers.
 */
export async function wakeExecution(
  env: Env,
  executionId: string,
  options?: {
    delayMs?: number;
    authorization?: string;
    scheduler?: Scheduler;
  },
): Promise<void> {
  // Update timestamp (for polling schedulers)
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `UPDATE workflow_executions SET updated_at = $1 WHERE id = $2`,
    params: [Date.now(), executionId],
  });

  // Use QStash scheduler for workflow execution
  const scheduler = options?.scheduler ?? createQStashScheduler(env);
  const authorization =
    options?.authorization ?? env.DECO_REQUEST_CONTEXT?.token;

  if (!authorization) {
    console.warn(`[WAKE] No authorization token for execution ${executionId}`);
    return;
  }

  if (options?.delayMs) {
    await scheduler.scheduleAfter(executionId, options.delayMs, {
      authorization,
    });
  } else {
    await scheduler.schedule(executionId, { authorization });
  }
}
