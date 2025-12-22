/**
 * Workflow Events & Signals API
 *
 * Unified events system for signals, timers, and durable execution.
 * Inspired by DBOS send/recv patterns and deco-cx/durable visible_at.
 */

import type { Env } from "../../main.ts";
import { transformDbRowToEvent } from "../../collections/workflow.ts";
import { type EventType, WorkflowEvent } from "@decocms/bindings/workflow";

// ============================================================================
// Core Event Operations
// ============================================================================

export async function addEvent(
  env: Env,
  event: Omit<WorkflowEvent, "id" | "created_at"> & { created_at?: number },
): Promise<WorkflowEvent> {
  const id = crypto.randomUUID();
  const created_at = event.created_at ?? Date.now();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `INSERT INTO workflow_events (id, execution_id, type, name, payload, created_at, visible_at, source_execution_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

  return {
    ...event,
    id,
    created_at: new Date(created_at).toISOString(),
  } as WorkflowEvent;
}

export async function getPendingEvents(
  env: Env,
  executionId: string,
  type?: EventType,
): Promise<WorkflowEvent[]> {
  const now = Date.now();
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM workflow_events WHERE execution_id = ? AND consumed_at IS NULL
          AND (visible_at IS NULL OR visible_at <= ?) ${type ? "AND type = ?" : ""}
          ORDER BY visible_at ASC NULLS FIRST, created_at ASC`,
    params: type ? [executionId, now, type] : [executionId, now],
  });
  return ((result.result[0]?.results || []) as Record<string, unknown>[]).map(
    transformDbRowToEvent,
  );
}

export async function consumeEvent(
  env: Env,
  executionId: string,
  type: EventType,
  name?: string,
): Promise<WorkflowEvent | null> {
  const now = Date.now();
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `UPDATE workflow_events SET consumed_at = ? WHERE id = (
            SELECT id FROM workflow_events WHERE execution_id = ? AND type = ?
            ${name ? "AND name = ?" : ""} AND consumed_at IS NULL
            AND (visible_at IS NULL OR visible_at <= ?)
            ORDER BY visible_at ASC NULLS FIRST, created_at ASC LIMIT 1
          ) RETURNING *`,
    params: name
      ? [now, executionId, type, name, now]
      : [now, executionId, type, now],
  });
  const row = result.result[0]?.results?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? transformDbRowToEvent(row) : null;
}

// ============================================================================
// Signals (Human-in-the-loop: approvals, webhooks, manual data entry)
// ============================================================================

export type WorkflowSignal = WorkflowEvent & { signal_name?: string };

export async function getSignals(
  env: Env,
  executionId: string,
): Promise<WorkflowSignal[]> {
  const events = await getPendingEvents(env, executionId, "signal");
  return events.map(
    (e): WorkflowSignal => ({ ...e, signal_name: e.name ?? undefined }),
  );
}

export async function consumeSignal(
  env: Env,
  signalId: string,
): Promise<boolean> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `UPDATE workflow_events SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL RETURNING id`,
    params: [Date.now(), signalId],
  });
  return (result.result[0]?.results?.length ?? 0) > 0;
}

// ============================================================================
// Timers (Durable sleep)
// ============================================================================

export async function scheduleTimer(
  env: Env,
  executionId: string,
  stepName: string,
  wakeAtEpochMs: number,
): Promise<WorkflowEvent> {
  await env.EVENT_BUS.EVENT_PUBLISH({
    type: "timer.scheduled",
    data: {
      executionId,
      stepName,
      wakeAtEpochMs,
    },
    deliverAt: new Date(wakeAtEpochMs).toISOString(),
    subject: executionId,
  });
  return addEvent(env, {
    execution_id: executionId,
    type: "timer",
    name: stepName,
    payload: { wakeAt: wakeAtEpochMs },
    title: stepName,
    updated_at: new Date().toISOString(),
    visible_at: wakeAtEpochMs,
  });
}

export async function checkTimer(
  env: Env,
  executionId: string,
  stepName: string,
): Promise<WorkflowEvent | null> {
  return consumeEvent(env, executionId, "timer", stepName);
}
