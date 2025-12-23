/**
 * Step Executor
 *
 * Orchestrates step execution with retry logic and timeout handling.
 */

import { createStepResult } from "server/lib/execution-db.ts";
import type { Env } from "../../types/env.ts";
import type {
  Step,
  StepResult,
  ExistingStepResult,
} from "../../types/step-types.ts";
import { getStepType } from "../../types/step-types.ts";
import { ExecutionContext } from "../context.ts";
import { executeCode } from "./code-step.ts";
import { executeSignalStep } from "./signal-step.ts";
import { executeToolStep } from "./tool-step.ts";

const DEFAULT_TIMEOUT_MS = 30000;

export class StepExecutor {
  private ctx: ExecutionContext;

  constructor(env: Env, executionId: string) {
    this.ctx = new ExecutionContext(env, executionId);
  }

  /**
   * Execute a step with retry and timeout handling.
   */
  async executeStep(
    step: Step,
    resolvedInput: Record<string, unknown>,
    existingStepResult: ExistingStepResult,
  ): Promise<StepResult> {
    await this.ctx.checkCancelled();
    const stepType = getStepType(step);
    const timeoutMs = step.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Signal steps don't need to claim (handled differently)
    let result: StepResult | undefined;
    if (stepType === "tool") {
      await this.ctx.claimStep(step.name, timeoutMs);
      result = await this.executeToolStepWithTimeout(
        step,
        resolvedInput,
        timeoutMs,
      );
      await this.ctx.completeStep(step.name, result.output, result.error);
    }

    if (stepType === "code" && "code" in step.action) {
      result = await executeCode(step.action.code, resolvedInput, step.name);
      await createStepResult(this.ctx.env, {
        execution_id: this.ctx.executionId,
        step_id: step.name,
        timeout_ms: 0,
        output: result.output,
        error: result.error,
        completed_at_epoch_ms: Date.now(),
      });
    }

    if (stepType === "signal" && "signalName" in step.action) {
      result = await executeSignalStep(this.ctx, step, existingStepResult);
      await createStepResult(this.ctx.env, {
        execution_id: this.ctx.executionId,
        step_id: step.name,
        timeout_ms: 0,
        output: result.output,
        error: result.error,
        completed_at_epoch_ms: Date.now(),
      });
    }

    if (!result) {
      throw new Error(`Step '${step.name}' failed`);
    }

    if (!result.completedAt) {
      await this.ctx.updateStep(step.name, {
        error: result.error,
        started_at_epoch_ms:
          existingStepResult?.started_at_epoch_ms ?? Date.now(),
      });

      throw new Error(
        `Step '${step.name}' failed after ${step.config?.maxAttempts ?? 1} attempt(s): ${result.error}`,
      );
    }

    return result;
  }

  private async executeToolStepWithTimeout(
    step: Step,
    resolvedInput: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<StepResult> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const result = await executeToolStep(this.ctx, step, resolvedInput);
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (abortController.signal.aborted) {
        throw new Error(`Step '${step.name}' timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
