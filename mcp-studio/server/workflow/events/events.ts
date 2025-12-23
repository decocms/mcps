/**
 * Workflow Events & Signals API
 *
 * Unified events system for signals, timers, and durable execution.
 * Inspired by DBOS send/recv patterns and deco-cx/durable visible_at.
 */

import type { Env } from "../../types/env.ts";
import { transformDbRowToEvent } from "../../collections/workflow.ts";
import { type EventType, WorkflowEvent } from "@decocms/bindings/workflow";

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
