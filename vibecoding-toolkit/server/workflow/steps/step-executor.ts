/**
 * Step Executors
 *
 * Individual execution logic for each step type.
 * Each function is pure and focused on a single step type.
 */

import type { Env } from "../../main.ts";
import type { CodeAction, Step } from "@decocms/bindings/workflow";
import type { RefContext } from "../../workflow/utils/ref-resolver.ts";
import { isAtRef, resolveRef } from "../../workflow/utils/ref-resolver.ts";
import {
  SleepActionSchema,
  ToolCallActionSchema,
  WaitForSignalActionSchema,
} from "@decocms/bindings/workflow";
import { executeCode } from "./code-step.ts";
import { consumeSignal, getSignals } from "../events/signals.ts";
import {
  DurableSleepError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "../../workflow/utils/errors.ts";
import { checkTimer, scheduleTimer } from "../events/events.ts";
import {
  createStepResult,
  getExecution,
  updateStepResult,
} from "../../lib/execution-db.ts";

export interface StepResult {
  id?: string;
  status: "success" | "error";
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  excludeFromWorkflowOutput?: boolean;
}

export class StepExecutor {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private async executeToolStep(
    step: Step,
    input: Record<string, unknown>,
  ): Promise<StepResult> {
    const startedAt = Date.now();
    try {
      const parsed = ToolCallActionSchema.safeParse(step.action);
      if (!parsed.success) {
        throw new Error("Tool step missing tool configuration");
      }

      const { connectionId, toolName } = parsed.data;

      if (!this.env.MESH_REQUEST_CONTEXT.meshUrl) {
        throw new Error("MESH_URL is not set");
      }

      const { result } = await this.env.CONNECTION.CONNECTION_CALL_TOOL({
        connectionId,
        toolName,
        arguments: input,
      });

      return {
        status: "success",
        output: result,
        startedAt,
        completedAt: Date.now(),
        excludeFromWorkflowOutput: isLargeOutput(result),
      };
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        startedAt,
      };
    }
  }

  /**
   * Execute a sleep step - durable sleep that survives worker restarts
   *
   * Uses timer events for durability:
   * - On first execution: Calculate wake time, schedule timer, throw DurableSleepError
   * - On resume: Check if timer is ready (via events table), complete or throw again
   */
  private async executeSleepStep(
    step: Step,
    ctx: RefContext,
    executionId: string,
    existingStepResult?: { started_at_epoch_ms?: number | null },
  ): Promise<StepResult> {
    const parsed = SleepActionSchema.safeParse(step.action);
    if (!parsed.success) {
      throw new Error("Sleep step missing sleep configuration");
    }

    const startedAt = existingStepResult?.started_at_epoch_ms || Date.now();

    // Check if timer already fired (resuming from durable sleep)
    const timer = await checkTimer(this.env, executionId, step.name);
    if (timer) {
      const wakeAt =
        (timer.payload as { wakeAt: number })?.wakeAt || Date.now();
      return {
        status: "success",
        output: {
          sleepDurationMs: wakeAt - startedAt,
        },
        startedAt,
        completedAt: Date.now(),
      };
    }

    // Calculate wake time
    let wakeAtEpochMs: number;

    if ("sleepUntil" in parsed.data) {
      // Sleep until a specific time
      const sleepUntil = parsed.data.sleepUntil as string;
      wakeAtEpochMs = isAtRef(sleepUntil as `@${string}`)
        ? new Date(
            resolveRef(sleepUntil as `@${string}`, ctx).value as string,
          ).getTime()
        : new Date(sleepUntil).getTime();
    } else if ("sleepMs" in parsed.data) {
      // Sleep for a duration
      wakeAtEpochMs = Date.now() + parsed.data.sleepMs;
    } else {
      throw new Error("Sleep step has neither sleepMs nor sleepUntil");
    }

    const remainingMs = Math.max(0, wakeAtEpochMs - Date.now());

    // Ready to wake?
    if (remainingMs <= 0) {
      return {
        status: "success",
        output: {
          sleepDurationMs: wakeAtEpochMs - startedAt,
        },
        startedAt,
        completedAt: Date.now(),
      };
    }

    // Short sleep - just wait inline (no need for durable timer)
    if (remainingMs <= 25000) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
      return {
        status: "success",
        output: {
          sleepDurationMs: wakeAtEpochMs - startedAt,
        },
        startedAt,
        completedAt: Date.now(),
      };
    }

    // Long sleep - schedule timer event and throw to re-queue
    await scheduleTimer(this.env, executionId, step.name, wakeAtEpochMs);
    throw new DurableSleepError(step.name, wakeAtEpochMs);
  }

  /**
   * Execute a waitForSignal step - blocks until signal received or timeout
   */
  private async executeWaitForSignalStep(
    step: Step,
    executionId: string,
    existingStepResult?: { started_at_epoch_ms?: number | null },
  ): Promise<StepResult> {
    const parsed = WaitForSignalActionSchema.safeParse(step.action);
    if (!parsed.success) {
      throw new Error("waitForSignal step missing configuration");
    }

    const { signalName, timeoutMs } = parsed.data;
    const waitStartedAt = existingStepResult?.started_at_epoch_ms || Date.now();

    if (timeoutMs && Date.now() - waitStartedAt > timeoutMs) {
      throw new Error(`Signal '${signalName}' timed out after ${timeoutMs}ms`);
    }

    const signals = await getSignals(this.env, executionId);
    const matching = signals.find((s) => s.signal_name === signalName);
    if (matching?.signal_name) {
      const consumed = await consumeSignal(this.env, matching.id);
      if (!consumed) {
        throw new Error(`Signal '${signalName}' not consumed`);
      }
      return {
        status: "success",
        output: {
          signalName: matching.signal_name,
          payload: matching.payload,
          receivedAt: matching.created_at,
          waitDurationMs: Date.now() - waitStartedAt,
        },
        startedAt: waitStartedAt,
      };
    }

    throw new WaitingForSignalError(
      executionId,
      step.name,
      signalName,
      timeoutMs,
      waitStartedAt,
    );
  }

  /**
   * Execute a step based on its type
   */
  async executeStep(
    step: Step,
    resolvedInput: Record<string, unknown>,
    ctx: RefContext,
    executionId: string,
    existingStepResult: {
      started_at_epoch_ms?: number | null;
      output?: unknown;
    },
  ): Promise<StepResult> {
    const execution = await getExecution(this.env, executionId);
    if (execution?.status === "cancelled") {
      throw new WorkflowCancelledError(executionId);
    }

    const stepType = getStepType(step) as "tool" | "code" | "sleep" | "signal";
    await createStepResult(this.env, {
      execution_id: executionId,
      step_id: step.name,
      started_at_epoch_ms: Date.now(),
    });

    // Extract retry and timeout config
    const maxAttempts = step.config?.maxAttempts ?? 1;
    const backoffMs = step.config?.backoffMs ?? 1000;
    const timeoutMs = step.config?.timeoutMs;

    let lastError: Error | null = null;
    let result: StepResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await this.executeStepWithTimeout(
          step,
          stepType,
          resolvedInput,
          ctx,
          executionId,
          existingStepResult,
          timeoutMs,
        );

        // Success - break out of retry loop
        if (result.status === "success") {
          break;
        }

        // Step returned error status - treat as retryable
        lastError = new Error(result.error || "Unknown step error");
      } catch (err) {
        // Re-throw non-retryable errors immediately
        if (
          err instanceof DurableSleepError ||
          err instanceof WaitingForSignalError ||
          err instanceof WorkflowCancelledError
        ) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // If we have more attempts, wait with exponential backoff
      if (attempt < maxAttempts) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All attempts exhausted
    if (!result || result.status === "error") {
      const errorMessage =
        lastError?.message || result?.error || "Unknown error";

      await updateStepResult(this.env, executionId, step.name, {
        error: errorMessage,
        started_at_epoch_ms:
          existingStepResult?.started_at_epoch_ms ?? Date.now(),
      });

      throw new Error(
        `Step '${step.name}' failed after ${maxAttempts} attempt(s): ${errorMessage}`,
      );
    }

    const { id: updatedStepResult } = await updateStepResult(
      this.env,
      executionId,
      step.name,
      {
        output: result.output,
        error: result.error,
        started_at_epoch_ms: result.startedAt,
        completed_at_epoch_ms:
          result.status === "success" ? Date.now() : undefined,
      },
    );

    return {
      ...result,
      id: updatedStepResult,
    };
  }

  /**
   * Execute step with optional timeout
   */
  private async executeStepWithTimeout(
    step: Step,
    stepType: "tool" | "code" | "sleep" | "signal",
    resolvedInput: Record<string, unknown>,
    ctx: RefContext,
    executionId: string,
    existingStepResult: {
      started_at_epoch_ms?: number | null;
      output?: unknown;
    },
    timeoutMs?: number,
  ): Promise<StepResult> {
    // No timeout - execute directly
    if (timeoutMs === undefined || timeoutMs === null || timeoutMs <= 0) {
      return this.executeStepCore(
        step,
        stepType,
        resolvedInput,
        ctx,
        executionId,
        existingStepResult,
      );
    }

    // Create abort controller for cancellable execution
    const abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      const result = await this.executeStepCore(
        step,
        stepType,
        resolvedInput,
        ctx,
        executionId,
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

  /**
   * Core step execution logic (extracted from original executeStep)
   */
  /**
   * Core step execution logic
   */
  private async executeStepCore(
    step: Step,
    stepType: "tool" | "code" | "sleep" | "signal",
    resolvedInput: Record<string, unknown>,
    ctx: RefContext,
    executionId: string,
    existingStepResult: {
      started_at_epoch_ms?: number | null;
      output?: unknown;
    },
  ): Promise<StepResult> {
    switch (stepType) {
      case "tool": {
        return await this.executeToolStep(step, resolvedInput);
      }

      case "code": {
        try {
          return await executeCode(
            (step.action as CodeAction).code,
            resolvedInput,
            step.name,
          );
        } catch (err) {
          console.error(`[STEP] executeCode THREW for '${step.name}':`, err);
          throw err;
        }
      }

      case "sleep": {
        return await this.executeSleepStep(
          step,
          ctx,
          executionId,
          existingStepResult,
        );
      }

      case "signal": {
        return await this.executeWaitForSignalStep(
          step,
          executionId,
          existingStepResult,
        );
      }

      default:
        throw new Error(`Unknown step type for step: ${step.name}`);
    }
  }
}

/**
 * Check if output is "large" and should be excluded from workflow output.
 * Large outputs stay in step_results for querying, not in workflow_executions.
 */
function isLargeOutput(output: unknown): boolean {
  if (output === null || output === undefined) return false;

  // Heuristic: if it's a string > 10KB, it's large
  if (typeof output === "string" && output.length > 10_000) return true;

  // Heuristic: if it's an array > 100 items, it's large
  if (Array.isArray(output) && output.length > 100) return true;

  // Heuristic: JSON size > 50KB is large
  try {
    const json = JSON.stringify(output);
    if (json.length > 50_000) return true;
  } catch {
    // If it can't be serialized, treat as large
    return true;
  }

  return false;
}

export function getStepType(step: Step): "tool" | "code" | "sleep" | "signal" {
  if ("toolName" in step.action) return "tool";
  if ("code" in step.action) return "code";
  if ("sleepUntil" in step.action || "sleepMs" in step.action) return "sleep";
  if ("signalName" in step.action) return "signal";
  throw new Error(`Unknown step type for step: ${step.name}`);
}
