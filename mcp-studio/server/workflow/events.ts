/**
 * Workflow Events API
 *
 * Unified events system for signals, timers, messages, and observability.
 * Inspired by DBOS send/recv patterns and deco-cx/durable visible_at.
 *
 * @see docs/EVENTS_AND_STREAMING.md
 */

import type { Env } from "../main.ts";
import { WorkflowEvent } from "@decocms/bindings/workflow";
import { executeWorkflow } from "./executor.ts";

/**
 * Add an event to the workflow events table
 */
export async function addEvent(
  env: Env,
  event: Omit<WorkflowEvent, "id" | "created_at"> & { created_at?: number },
): Promise<WorkflowEvent> {
  const id = crypto.randomUUID();
  const created_at = event.created_at ?? new Date().getTime();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      INSERT INTO workflow_events 
      (id, execution_id, type, name, payload, created_at, visible_at, source_execution_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  return {
    ...event,
    id,
    created_at: new Date(created_at).toISOString(),
  } as WorkflowEvent;
}

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
): Promise<WorkflowEvent> {
  const event = await addEvent(env, {
    execution_id: executionId,
    type: "signal",
    name: signalName,
    title: signalName,
    updated_at: new Date().toISOString(),
    payload,
    visible_at: Date.now(), // Immediately visible
  });
  const state = (env as unknown as Env).MESH_REQUEST_CONTEXT?.state;
  executeWorkflow({ ...env, ...state } as unknown as Env, executionId).catch(
    (error: Error) => {
      console.error(`[EXECUTE_WORKFLOW] Error executing workflow: ${error}`);
    },
  );
  return event;
}
