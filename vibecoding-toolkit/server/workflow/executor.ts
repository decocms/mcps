/**
 * Workflow Executor - Orchestrates parallel step execution based on DAG analysis
 */

import type { Env } from "../main.ts";
import type { RefContext } from "./utils/ref-resolver.ts";
import { resolveAllRefs, resolveRef } from "./utils/ref-resolver.ts";
import {
  getExecution,
  getStepResults,
  updateExecution,
} from "../lib/execution-db.ts";
import type { Step } from "@decocms/bindings/workflow";
import { getWorkflow } from "server/tools/workflow/workflow.ts";
import { StepExecutor } from "./steps/step-executor.ts";
import { groupStepsByLevel, validateNoCycles } from "./utils/dag.ts";
import {
  DurableSleepError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "./utils/errors.ts";

function parseForEachItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null && "content" in value) {
    const text = (value as { content: { text: string }[] }).content?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    }
  }
  throw new Error(`forEach items must resolve to an array`);
}

async function executeForEach(
  step: Step,
  ctx: RefContext,
  stepExecutor: StepExecutor,
  executionId: string,
): Promise<{ outputs: unknown[]; stepIds: string[] }> {
  const config = step.config!.loop!.for!;
  const items = parseForEachItems(
    resolveRef(config.items as `@${string}`, ctx).value,
  );
  console.log(`[EXECUTOR] items: ${JSON.stringify(items)}`);
  const limit = step.config!.loop!.limit ?? items.length;

  const results = [];
  for (let i = 0; i < limit; i++) {
    const itemCtx: RefContext = { ...ctx, item: items[i], index: i };
    const input = resolveAllRefs(step.input, itemCtx).resolved as Record<
      string,
      unknown
    >;
    results.push(
      await stepExecutor.executeStep(
        { ...step, name: `${step.name}[${i}]` },
        input,
        itemCtx,
        executionId,
        { started_at_epoch_ms: Date.now() },
      ),
    );
  }
  return {
    outputs: results.map((r) => r.output),
    stepIds: results.map((r) => r.id!),
  };
}

function restoreRuntimeContext(env: Env, execution: unknown) {
  const runtimeContext = (
    execution as {
      runtime_context?: {
        token?: string;
        meshUrl?: string;
        connectionId?: string;
        authorization?: string;
      };
    }
  ).runtime_context;
  if (runtimeContext?.token && env.MESH_REQUEST_CONTEXT) {
    Object.assign(env.MESH_REQUEST_CONTEXT, {
      token: runtimeContext.token,
      meshUrl: runtimeContext.meshUrl,
      connectionId: runtimeContext.connectionId,
      authorization: runtimeContext.authorization,
    });
  }
}

async function handleExecutionError(
  env: Env,
  executionId: string,
  err: unknown,
) {
  if (err instanceof WaitingForSignalError) {
    await updateExecution(env, executionId, {
      status: "enqueued",
      error: err.message,
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
  if (err instanceof DurableSleepError) {
    await updateExecution(env, executionId, { status: "enqueued" });
    return { status: "durable_sleep", message: err.message };
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

export async function executeWorkflow(env: Env, executionId: string) {
  try {
    const execution = await getExecution(env, executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    restoreRuntimeContext(env, execution);

    const workflow = await getWorkflow(env, execution.workflow_id);
    if (!workflow) throw new Error(`Workflow ${executionId} not found`);

    const steps = (
      typeof workflow.steps === "string"
        ? JSON.parse(workflow.steps)
        : workflow.steps || []
    ) as Step[];
    const workflowInput =
      typeof execution.input === "string"
        ? JSON.parse(execution.input)
        : execution.input || {};

    // Build context from cached results
    const stepOutputs = new Map<string, unknown>();
    for (const sr of await getStepResults(env, executionId)) {
      if (sr.completed_at_epoch_ms && sr.output)
        stepOutputs.set(sr.step_id, sr.output);
    }

    const ctx: RefContext = { stepOutputs, workflowInput };
    const completedSteps: string[] = [];
    const alreadyCompleted = new Set(stepOutputs.keys());
    const stepExecutor = new StepExecutor(env);

    const validation = validateNoCycles(steps);
    if (!validation.isValid) throw new Error(validation.error);

    // Execute steps level by level (parallel within each level)
    for (const levelSteps of groupStepsByLevel(steps)) {
      levelSteps
        .filter((s) => alreadyCompleted.has(s.name))
        .forEach((s) => completedSteps.push(s.name));
      const pending = levelSteps.filter((s) => !alreadyCompleted.has(s.name));
      if (!pending.length) continue;

      const results = await Promise.all(
        pending.map(async (step) => {
          if (step.config?.loop?.for) {
            console.log(`[EXECUTOR] executing forEach step: ${step.name}`);
            const { outputs, stepIds } = await executeForEach(
              step,
              ctx,
              stepExecutor,
              executionId,
            );
            return { step, outputs, stepIds, isForEach: true };
          }
          const input = resolveAllRefs(step.input, ctx).resolved as Record<
            string,
            unknown
          >;
          const result = await stepExecutor.executeStep(
            step,
            input,
            ctx,
            executionId,
            { started_at_epoch_ms: Date.now() },
          );
          if (!result.id) throw new Error(`Step result id is required`);
          return { step, result, isForEach: false };
        }),
      );

      for (const r of results) {
        if (r.isForEach) {
          stepOutputs.set(r.step.name, r.outputs);
          completedSteps.push(...r.stepIds!);
        } else {
          stepOutputs.set(r.step.name, r.result!.output);
          completedSteps.push(r.result!.id!);
        }
      }
    }

    const output = {
      _summary: true,
      completedSteps,
      lastStep: completedSteps[completedSteps.length - 1],
      message: "Full outputs available in step results",
    };
    await updateExecution(env, executionId, {
      status: "success",
      output,
      completed_at_epoch_ms: Date.now(),
    });
    return { status: "success", output };
  } catch (err) {
    return handleExecutionError(env, executionId, err);
  }
}
