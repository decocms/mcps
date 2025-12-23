/**
 * Step Executor
 *
 * Orchestrates step execution with retry logic and timeout handling.
 */

import type { Env } from "../../types/env.ts";
import type {
  Step,
  StepResult,
  ExistingStepResult,
} from "../../types/step-types.ts";
import { getStepType, isCodeAction } from "../../types/step-types.ts";
import { ExecutionContext } from "../context.ts";
import { executeToolStep } from "./tool-step.ts";
import { executeSignalStep } from "./signal-step.ts";
import { executeCode } from "./code-step.ts";
import {
  WaitingForSignalError,
  WorkflowCancelledError,
} from "../utils/errors.ts";

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
    if (stepType !== "signal") {
      await this.ctx.claimStep(step.name, timeoutMs);
    }

    const result = await this.executeWithRetry(
      step,
      stepType,
      resolvedInput,
      existingStepResult,
    );

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

    const updated = await this.ctx.updateStep(step.name, {
      output: result.output,
      error: result.error,
      started_at_epoch_ms: result.startedAt,
      completed_at_epoch_ms: result.completedAt,
    });

    return { ...result, stepId: updated.stepId };
  }

  private async executeWithRetry(
    step: Step,
    stepType: "tool" | "code" | "signal",
    resolvedInput: Record<string, unknown>,
    existingStepResult: ExistingStepResult,
  ): Promise<StepResult> {
    const maxAttempts = step.config?.maxAttempts ?? 1;
    const backoffMs = step.config?.backoffMs ?? 1000;
    const timeoutMs = step.config?.timeoutMs;

    let lastError: Error | null = null;
    let result: StepResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await this.executeWithTimeout(
          step,
          stepType,
          resolvedInput,
          existingStepResult,
          timeoutMs,
        );

        if (result.completedAt) {
          return result;
        }

        lastError = new Error(result.error);
      } catch (err) {
        if (
          err instanceof WaitingForSignalError ||
          err instanceof WorkflowCancelledError
        ) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < maxAttempts) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return (
      result ?? {
        stepId: step.name,
        startedAt: Date.now(),
        error: lastError?.message ?? "Unknown error",
      }
    );
  }

  private async executeWithTimeout(
    step: Step,
    stepType: "tool" | "code" | "signal",
    resolvedInput: Record<string, unknown>,
    existingStepResult: ExistingStepResult,
    timeoutMs?: number,
  ): Promise<StepResult> {
    if (!timeoutMs || timeoutMs <= 0) {
      return this.executeCore(
        step,
        stepType,
        resolvedInput,
        existingStepResult,
      );
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const result = await this.executeCore(
        step,
        stepType,
        resolvedInput,
        existingStepResult,
      );
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

  private async executeCore(
    step: Step,
    stepType: "tool" | "code" | "signal",
    resolvedInput: Record<string, unknown>,
    existingStepResult: ExistingStepResult,
  ): Promise<StepResult> {
    switch (stepType) {
      case "tool":
        return executeToolStep(this.ctx, step, resolvedInput);

      case "code":
        if (!isCodeAction(step.action)) {
          throw new Error("Invalid code action");
        }
        return executeCode(step.action.code, resolvedInput, step.name);

      case "signal":
        return executeSignalStep(this.ctx, step, existingStepResult);

      default:
        throw new Error(`Unknown step type for step: ${step.name}`);
    }
  }
}
