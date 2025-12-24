/**
 * Workflow Error Handler
 *
 * Centralized error handling for workflow execution.
 */

import type { Env } from "../types/env.ts";
import { updateExecution } from "../lib/execution-db.ts";
import {
  ExecutionNotFoundError,
  StepTimeoutError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "./utils/errors.ts";

export type ExecuteWorkflowResult =
  | { status: "success"; output: unknown }
  | { status: "error"; error: string }
  | { status: "cancelled"; error?: string }
  | { status: "waiting_for_signal"; message: string }
  | { status: "skipped"; reason: string }
  | { status: "stuck"; message: string };

export async function handleExecutionError(
  env: Env,
  executionId: string,
  err: unknown,
): Promise<ExecuteWorkflowResult> {
  if (err instanceof ExecutionNotFoundError) {
    return { status: "skipped", reason: "Execution busy or not found" };
  }

  if (err instanceof StepTimeoutError) {
    await updateExecution(env, executionId, {
      status: "error",
      error: err.message,
      completed_at_epoch_ms: Date.now(),
    });
    return { status: "error", error: err.message };
  }

  if (err instanceof WaitingForSignalError) {
    await updateExecution(env, executionId, {
      status: "enqueued",
    });
    return { status: "waiting_for_signal", message: err.message };
  }

  if (err instanceof WorkflowCancelledError) {
    await updateExecution(env, executionId, {
      status: "cancelled",
      error: err.message,
    });
    return { status: "cancelled", error: err.message };
  }

  const errorMsg = err instanceof Error ? err.message : String(err);
  console.error(`[WORKFLOW] Error executing workflow: ${errorMsg}`);

  await updateExecution(env, executionId, {
    status: "error",
    error: errorMsg,
    completed_at_epoch_ms: Date.now(),
  });

  return { status: "error", error: errorMsg };
}
