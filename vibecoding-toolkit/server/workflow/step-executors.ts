/**
 * Step Executors
 *
 * Individual execution logic for each step type.
 * Each function is pure and focused on a single step type.
 */

import type { Env } from "../main.ts";
import type { CodeAction, Step } from "@decocms/bindings/workflow";
import type { RefContext } from "./ref-resolver.ts";
import type {
  SleepStepResult,
  StepExecutionResult,
  ToolStepResult,
  WaitForSignalStepResult,
} from "./types.ts";
import { isAtRef, resolveRef } from "./ref-resolver.ts";
import {
  SleepActionSchema,
  ToolCallActionSchema,
  WaitForSignalActionSchema,
} from "@decocms/bindings/workflow";
import { executeCode } from "./transform-executor.ts";
import { consumeSignal, getSignals } from "./signals.ts";
import { createProxyConnection } from "./connection.ts";
import { DurableSleepError, WaitingForSignalError } from "./errors.ts";
import { checkTimer, scheduleTimer } from "./events.ts";

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

export async function executeToolStep(
  env: Env,
  step: Step,
  input: Record<string, unknown>,
): Promise<ToolStepResult> {
  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("Tool step missing tool configuration");
  }

  const { connectionId, toolName } = parsed.data;
  console.log({
    toolName,
    connectionId,
    input: JSON.stringify(input, null, 2),
  });
  let result: unknown;

  const connection = createProxyConnection(connectionId, {
    workspace: env.DECO_CHAT_WORKSPACE as string,
    token: env.MESH_REQUEST_CONTEXT.token,
  });

  result = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
    connection: connection as any,
    params: { name: toolName, arguments: input },
  });

  const structuredContent =
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result
      ? result.structuredContent
      : undefined;
  const content =
    typeof result === "object" && result !== null && "content" in result
      ? result.content
      : undefined;
  const output = structuredContent ?? content ?? result;

  return {
    status: "completed",
    output,
    startedAt: Date.now(),
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
export async function executeSleepStep(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  existingStepResult?: { started_at_epoch_ms?: number | null },
): Promise<SleepStepResult> {
  const parsed = SleepActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("Sleep step missing sleep configuration");
  }

  const startedAt = existingStepResult?.started_at_epoch_ms || Date.now();

  // Check if timer already fired (resuming from durable sleep)
  const timer = await checkTimer(env, executionId, step.name);
  if (timer) {
    const wakeAt = (timer.payload as { wakeAt: number })?.wakeAt || Date.now();
    return {
      slept: true,
      sleepDurationMs: wakeAt - startedAt,
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
      slept: true,
      sleepDurationMs: wakeAtEpochMs - startedAt,
    };
  }

  // Short sleep - just wait inline (no need for durable timer)
  if (remainingMs <= 25000) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
    return {
      slept: true,
      sleepDurationMs: wakeAtEpochMs - startedAt,
    };
  }

  // Long sleep - schedule timer event and throw to re-queue
  await scheduleTimer(env, executionId, step.name, wakeAtEpochMs);
  throw new DurableSleepError(step.name, wakeAtEpochMs);
}

/**
 * Execute a waitForSignal step - blocks until signal received or timeout
 */
export async function executeWaitForSignalStep(
  env: Env,
  step: Step,
  executionId: string,
  existingStepResult?: { started_at_epoch_ms?: number | null },
): Promise<WaitForSignalStepResult> {
  const parsed = WaitForSignalActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("waitForSignal step missing configuration");
  }

  const { signalName, timeoutMs } = parsed.data;
  const waitStartedAt = existingStepResult?.started_at_epoch_ms || Date.now();

  if (timeoutMs && Date.now() - waitStartedAt > timeoutMs) {
    throw new Error(`Signal '${signalName}' timed out after ${timeoutMs}ms`);
  }

  const signals = await getSignals(env, executionId);
  const matching = signals.find((s) => s.signal_name === signalName);

  if (matching?.signal_name) {
    await consumeSignal(env, matching.id);
    console.log(`[SIGNAL] Step '${step.name}' received signal '${signalName}'`);
    return {
      signalName: matching.signal_name,
      payload: matching.payload,
      receivedAt: matching.created_at,
      waitDurationMs: Date.now() - waitStartedAt,
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

export function getStepType(step: Step): "tool" | "code" | "sleep" | "signal" {
  if ("toolName" in step.action) return "tool";
  if ("code" in step.action) return "code";
  if ("sleepUntil" in step.action || "sleepMs" in step.action) return "sleep";
  if ("signalName" in step.action) return "signal";
  throw new Error("Unknown step type");
}

/**
 * Execute a step based on its type
 */
export async function executeStep(
  env: Env,
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: RefContext,
  executionId: string,
  existingStepResult: { started_at_epoch_ms?: number | null; output?: unknown },
): Promise<StepExecutionResult> {
  const stepType = getStepType(step) as "tool" | "code" | "sleep" | "signal";
  const startedAt = Date.now();
  console.log(`[STEP] Executing step '${step.name}' of type '${stepType}'`);

  switch (stepType) {
    case "tool": {
      const result = await executeToolStep(env, step, resolvedInput);
      return {
        output: result.output,
        error: result.error,
        startedAt,
        completedAt: Date.now(),
        excludeFromWorkflowOutput: result.excludeFromWorkflowOutput,
      };
    }

    case "code": {
      console.log(`[STEP] About to executeCode for '${step.name}'`);
      try {
        const result = await executeCode(
          (step.action as CodeAction).code,
          resolvedInput,
          step.name,
        );
        console.log(
          `[STEP] executeCode result for '${step.name}':`,
          result.success ? "success" : `error: ${result.error}`,
        );
        return {
          output: result.output,
          error: result.error,
          startedAt,
          completedAt: Date.now(),
        };
      } catch (err) {
        console.error(`[STEP] executeCode THREW for '${step.name}':`, err);
        throw err;
      }
    }

    case "sleep": {
      const result = await executeSleepStep(
        env,
        step,
        ctx,
        executionId,
        existingStepResult,
      );
      return {
        output: result,
        error: result.slept ? undefined : "Sleep step failed",
        startedAt,
        completedAt: result.slept ? Date.now() : undefined,
      };
    }

    case "signal": {
      const result = await executeWaitForSignalStep(
        env,
        step,
        executionId,
        existingStepResult,
      );
      // Return full result so refs like @step.output.payload work even if payload is null
      return {
        output: result,
        startedAt,
        completedAt: Date.now(),
      };
    }

    default:
      throw new Error(`Unknown step type for step: ${step.name}`);
  }
}
