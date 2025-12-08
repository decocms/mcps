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
} from "../../workflow/utils/errors.ts";
import { checkTimer, scheduleTimer } from "../events/events.ts";
import {
  createStepResult,
  updateStepResult,
  writeStreamChunk,
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

export function responseToStream(response: Response): ReadableStream<unknown> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, unknown>({
      transform(chunk, controller) {
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line) as unknown;
              controller.enqueue(parsed);
            } catch (error) {
              console.error("Failed to parse stream chunk:", error);
              throw error;
            }
          }
        }
      },
    }),
  );
}

export class StepExecutor {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Execute a tool step with live streaming to the database.
   *
   * Streams each chunk to step_stream_chunks table for real-time visibility,
   * then saves the final accumulated result to step_results when complete.
   */
  private async executeToolStep(
    step: Step,
    input: Record<string, unknown>,
    executionId: string,
  ): Promise<StepResult> {
    const parsed = ToolCallActionSchema.safeParse(step.action);
    if (!parsed.success) {
      throw new Error("Tool step missing tool configuration");
    }

    const { connectionId, toolName } = parsed.data;
    console.log("[TOOL STEP]", { toolName, connectionId, input });

    if (!this.env.MESH_REQUEST_CONTEXT.meshUrl) {
      throw new Error("MESH_URL is not set");
    }

    const startedAt = Date.now();

    const response = await fetch(
      `${this.env.MESH_REQUEST_CONTEXT.meshUrl}/mcp/${connectionId}/stream/${toolName}`,
      {
        method: "POST",
        body: JSON.stringify(input),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.MESH_REQUEST_CONTEXT.token}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tool call failed: ${response.status} - ${errorText}`);
    }

    const stream = responseToStream(response);
    const reader = stream.getReader();

    const chunks: unknown[] = [];
    let chunkIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writeStreamChunk(
          this.env,
          executionId,
          step.name,
          chunkIndex,
          value,
        );

        chunks.push(value);
        chunkIndex++;
      }
    } finally {
      reader.releaseLock();
    }

    console.log(
      `[TOOL STEP] Completed ${step.name} with ${chunks.length} chunks`,
    );

    // Determine final output - single chunk or array of chunks
    const output = chunks.length === 1 ? chunks[0] : chunks;

    // Clean up stream chunks after step completes (optional - keep for debugging)
    // await deleteStreamChunks(this.env, executionId, step.name);

    return {
      status: "success",
      output,
      startedAt,
      completedAt: Date.now(),
      excludeFromWorkflowOutput: isLargeOutput(output),
    };
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
    console.log("🚀 ~ StepExecutor ~ executeWaitForSignalStep ~ step:", step);
    console.log(
      "🚀 ~ StepExecutor ~ executeWaitForSignalStep ~ executionId:",
      executionId,
    );
    console.log(
      "🚀 ~ StepExecutor ~ executeWaitForSignalStep ~ existingStepResult:",
      existingStepResult,
    );
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
      await consumeSignal(this.env, matching.id);
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
    const stepType = getStepType(step) as "tool" | "code" | "sleep" | "signal";
    console.log(`[STEP] Executing step '${step.name}' of type '${stepType}'`);
    await createStepResult(this.env, {
      execution_id: executionId,
      step_id: step.name,
      started_at_epoch_ms: Date.now(),
    });
    let result: StepResult;

    switch (stepType) {
      case "tool": {
        result = await this.executeToolStep(step, resolvedInput, executionId);
        break;
      }

      case "code": {
        console.log(`[STEP] About to executeCode for '${step.name}'`);
        try {
          result = await executeCode(
            (step.action as CodeAction).code,
            resolvedInput,
            step.name,
          );
        } catch (err) {
          console.error(`[STEP] executeCode THREW for '${step.name}':`, err);
          throw err;
        }
        break;
      }

      case "sleep": {
        result = await this.executeSleepStep(
          step,
          ctx,
          executionId,
          existingStepResult,
        );
        break;
      }

      case "signal": {
        result = await this.executeWaitForSignalStep(
          step,
          executionId,
          existingStepResult,
        );
        // Return full result so refs like @step.output.payload work even if payload is null
        break;
      }

      default:
        throw new Error(`Unknown step type for step: ${step.name}`);
    }

    console.log("🚀 ~ StepExecutor ~ executeStep ~ result:", result);

    const { id: updatedStepResult } = await updateStepResult(
      this.env,
      executionId,
      step.name,
      {
        output: result.output,
        error: result.error,
        started_at_epoch_ms: result.startedAt,
        completed_at_epoch_ms: Date.now(),
      },
    );

    return {
      ...result,
      id: updatedStepResult,
    };
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
  throw new Error("Unknown step type");
}
