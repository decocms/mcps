/**
 * Signal Step Executor
 *
 * Executes waitForSignal steps - blocks until signal received or timeout.
 */

import { WaitForSignalActionSchema } from "@decocms/bindings/workflow";
import { consumeSignal, getSignals } from "../events.ts";
import { WaitingForSignalError } from "../../utils/errors.ts";
import { createStepResult } from "../../db/queries/executions.ts";
import type { Step, StepResult, ExistingStepResult } from "../../types/step.ts";
import type { ExecutionContext } from "../context.ts";

export async function executeSignalStep(
  ctx: ExecutionContext,
  step: Step,
  existingStepResult?: ExistingStepResult,
): Promise<StepResult> {
  const parsed = WaitForSignalActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("waitForSignal step missing configuration");
  }

  const { signalName } = parsed.data;
  const timeoutMs = step.config?.timeoutMs;
  const waitStartedAt = existingStepResult?.started_at_epoch_ms || Date.now();

  if (timeoutMs && Date.now() - waitStartedAt > timeoutMs) {
    throw new Error(`Signal '${signalName}' timed out after ${timeoutMs}ms`);
  }

  const signals = await getSignals(ctx.env, ctx.executionId);
  const matching = signals.find((s) => s.signal_name === signalName);

  if (matching?.signal_name) {
    const consumed = await consumeSignal(ctx.env, matching.id);
    if (!consumed) {
      throw new Error(`Signal '${signalName}' not consumed`);
    }

    await createStepResult(ctx.env, {
      execution_id: ctx.executionId,
      step_id: step.name,
    });

    return {
      output: {
        signalName: matching.signal_name,
        payload: matching.payload,
        receivedAt: matching.created_at,
        waitDurationMs: Date.now() - waitStartedAt,
      },
      stepId: step.name,
      startedAt: waitStartedAt,
      completedAt: Date.now(),
    };
  }

  throw new WaitingForSignalError(
    ctx.executionId,
    step.name,
    signalName,
    timeoutMs,
    waitStartedAt,
  );
}
