/**
 * Signals API - Wrapper over the events system
 *
 * Signals are now stored in the unified workflow_events table.
 * This module provides a convenient API for signal operations.
 */

import { WorkflowEvent } from "@decocms/bindings/workflow";
import type { Env } from "../../main.ts";
import { sendSignal as sendEventSignal, getPendingEvents } from "./events.ts";
import { Scheduler } from "../scheduler.ts";

/**
 * WorkflowSignal type with signal_name for backwards compatibility
 */
export type WorkflowSignal = WorkflowEvent & {
  signal_name?: string;
};

/**
 * Send a signal to a workflow execution.
 */
export async function sendSignal(
  env: Env,
  executionId: string,
  options?: {
    name?: string;
    payload?: unknown;
    resumeExecution?: boolean;
    authorization?: string;
    scheduler?: Scheduler;
  },
): Promise<WorkflowSignal> {
  return sendEventSignal(
    env,
    executionId,
    options?.name ?? "",
    options?.payload,
    {
      wakeExecution: options?.resumeExecution ?? true,
      authorization: options?.authorization,
      scheduler: options?.scheduler,
    },
  );
}

/**
 * Get unconsumed signals for an execution.
 */
export async function getSignals(
  env: Env,
  executionId: string,
): Promise<WorkflowSignal[]> {
  const events = await getPendingEvents(env, executionId, "signal");
  // Map to the expected shape (name field is called signal_name in old API)
  return events.map(
    (e): WorkflowSignal => ({
      ...e,
      signal_name: e.name ?? undefined,
    }),
  );
}

/**
 * Consume (acknowledge) a signal by ID.
 */
export async function consumeSignal(
  env: Env,
  signalId: string,
): Promise<boolean> {
  const now = Date.now();
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `
      UPDATE workflow_events
      SET consumed_at = ?
      WHERE id = ? AND consumed_at IS NULL
      RETURNING id
    `,
    params: [now, signalId],
  });
  return (result.result[0]?.results?.length ?? 0) > 0;
}
