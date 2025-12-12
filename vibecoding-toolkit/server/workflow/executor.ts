/**
 * Workflow Executor
 *
 * Orchestrates workflow execution with automatic parallelization.
 * Steps are analyzed for @ref dependencies and grouped into levels:
 * - Steps with no step dependencies run first (level 0)
 * - Steps depending on level N run at level N+1
 * - Steps at the same level run in parallel
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import type { Env } from "../main.ts";
import type { RefContext } from "./utils/ref-resolver.ts";
import {
  canResolveAllRefs,
  resolveAllRefs,
  resolveRef,
} from "./utils/ref-resolver.ts";
import {
  getExecution,
  getStepResults,
  updateExecution,
} from "../lib/execution-db.ts";
import type { Step, Trigger } from "@decocms/bindings/workflow";
import { getWorkflow } from "server/tools/workflow/workflow.ts";
import { StepExecutor } from "./steps/step-executor.ts";
import { groupStepsByLevel, validateNoCycles } from "./utils/dag.ts";
import {
  DurableSleepError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "./utils/errors.ts";

function parseForEachItems(value: unknown): unknown[] {
  // Already an array
  if (Array.isArray(value)) return value;

  // LLM output format: { content: [{ text: "..." }] }
  if (typeof value === "object" && value !== null && "content" in value) {
    const text = (value as { content: { text: string }[] }).content?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    }
  }

  throw new Error(`forEach items must resolve to an array`);
}

interface TriggerResult {
  triggerId: string;
  status: "triggered" | "skipped" | "failed";
  executionIds?: string[];
  error?: string;
}

async function fireTriggers(
  env: Env,
  triggers: Trigger[],
  ctx: RefContext,
  parentExecutionId: string,
): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];

  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    const triggerId = `trigger-${i}`;

    try {
      if (!canResolveAllRefs(trigger.input, ctx)) {
        results.push({ triggerId, status: "skipped" });
        continue;
      }

      const execId = await enqueueTrigger(env, trigger, ctx, parentExecutionId);
      results.push({
        triggerId,
        status: "triggered",
        executionIds: [execId],
      });
    } catch (err) {
      results.push({
        triggerId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

async function enqueueTrigger(
  env: Env,
  trigger: Trigger,
  ctx: RefContext,
  parentExecutionId: string,
): Promise<string> {
  const { resolved: input } = resolveAllRefs(trigger.input, ctx);
  const executionId = crypto.randomUUID();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `INSERT INTO workflow_executions (id, workflow_id, status, created_at, updated_at, input, parent_execution_id)
          VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    params: [
      executionId,
      trigger.workflowId,
      Date.now(),
      Date.now(),
      JSON.stringify(input),
      parentExecutionId,
    ],
  });

  return executionId;
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

  const limit = step.config!.loop!.limit ?? items.length;

  const executeItem = async (item: unknown, index: number) => {
    const itemCtx: RefContext = { ...ctx, item, index };
    const input = resolveAllRefs(step.input, itemCtx).resolved as Record<
      string,
      unknown
    >;
    return stepExecutor.executeStep(
      { ...step, name: `${step.name}[${index}]` },
      input,
      itemCtx,
      executionId,
      { started_at_epoch_ms: Date.now() },
    );
  };

  const results = [];
  for (let i = 0; i < limit; i++) {
    results.push(await executeItem(items[i], i));
  }
  return {
    outputs: results.map((r) => r.output),
    stepIds: results.map((r) => r.id!),
  };
}

export async function executeWorkflow(env: Env, executionId: string) {
  try {
    const execution = await getExecution(env, executionId);

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    // Restore the runtime context from when the execution was created
    // This allows cron-triggered executions to use the original user's auth
    const runtimeContext = (
      execution as unknown as {
        runtime_context?: {
          token?: string;
          meshUrl?: string;
          connectionId?: string;
          authorization?: string;
        };
      }
    ).runtime_context;

    if (runtimeContext?.token && env.MESH_REQUEST_CONTEXT) {
      env.MESH_REQUEST_CONTEXT.token = runtimeContext.token;
      env.MESH_REQUEST_CONTEXT.meshUrl =
        runtimeContext.meshUrl ?? "http://localhost:8002";
      env.MESH_REQUEST_CONTEXT.connectionId = runtimeContext.connectionId;
      env.MESH_REQUEST_CONTEXT.authorization = runtimeContext.authorization;
    }

    // Load workflow definition
    const workflow = await getWorkflow(env, execution.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow ${executionId} not found`);
    }

    const parsedSteps = workflow.steps
      ? typeof workflow.steps === "string"
        ? JSON.parse(workflow.steps)
        : workflow.steps
      : [];

    const steps = parsedSteps as Step[];

    const triggers: Trigger[] = workflow.triggers || [];
    const workflowInput =
      typeof execution.input === "string"
        ? JSON.parse(execution.input)
        : execution.input || {};

    // Build context from cached results
    const stepOutputs = new Map<string, unknown>();
    for (const sr of await getStepResults(env, executionId)) {
      if (!!sr.completed_at_epoch_ms && !!sr.output) {
        stepOutputs.set(sr.step_id, sr.output);
      }
    }

    const ctx: RefContext = { stepOutputs, workflowInput };
    let lastOutput: unknown;
    const completedSteps: string[] = [];

    // Track steps that were already completed from cached results
    const alreadyCompletedStepNames = new Set(stepOutputs.keys());

    const stepExecutor = new StepExecutor(env);

    // Validate no cycles before execution
    const validation = validateNoCycles(steps);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Group steps by execution level for parallel execution
    const stepsByLevel = groupStepsByLevel(steps);

    // Execute each level - steps within a level run in parallel
    for (const levelSteps of stepsByLevel) {
      // Filter out steps that have already been executed
      const pendingSteps = levelSteps.filter(
        (step) => !alreadyCompletedStepNames.has(step.name),
      );

      // Track already-completed steps from this level
      for (const step of levelSteps) {
        if (alreadyCompletedStepNames.has(step.name)) {
          completedSteps.push(step.name);
        }
      }

      // Skip execution if all steps in this level are already done
      if (pendingSteps.length === 0) {
        continue;
      }

      // Execute all pending steps in this level in parallel
      const levelResults = await Promise.all(
        pendingSteps.map(async (step) => {
          if (step.config?.loop?.for) {
            const { outputs, stepIds } = await executeForEach(
              step,
              ctx,
              stepExecutor,
              executionId,
            );
            return { step, outputs, stepIds, isForEach: true };
          } else {
            const input = resolveAllRefs(step.input, ctx).resolved as Record<
              string,
              unknown
            >;
            const result = await stepExecutor.executeStep(
              step,
              input,
              ctx,
              executionId,
              {
                started_at_epoch_ms: Date.now(),
              },
            );
            if (!result.id) throw new Error(`Step result id is required`);
            return { step, result, isForEach: false };
          }
        }),
      );

      // Update context with results from this level (needed for next level)
      for (const levelResult of levelResults) {
        if (levelResult.isForEach) {
          stepOutputs.set(levelResult.step.name, levelResult.outputs);
          completedSteps.push(...levelResult.stepIds!);
        } else {
          stepOutputs.set(levelResult.step.name, levelResult.result!.output);
          completedSteps.push(levelResult.result!.id!);
        }
      }
    }

    // Fire triggers - use the full step output (not excluded) for ref resolution
    let triggerResults: TriggerResult[] | undefined;
    if (triggers.length) {
      // For triggers, use the last step's output even if excluded (for @ref resolution)
      const lastStepOutput =
        completedSteps.length > 0
          ? stepOutputs.get(completedSteps[completedSteps.length - 1])
          : undefined;
      ctx.output = lastStepOutput;
      triggerResults = await fireTriggers(env, triggers, ctx, executionId);
    }

    // Build smart output for the execution record
    // If all outputs were excluded (large), provide a summary reference
    const workflowOutput =
      lastOutput !== undefined
        ? lastOutput
        : {
            _summary: true,
            completedSteps,
            lastStep: completedSteps[completedSteps.length - 1],
            message: "Full outputs available in step results",
          };

    // Mark completed
    await updateExecution(env, executionId, {
      status: "success",
      output: workflowOutput,
      completed_at_epoch_ms: Date.now(),
    });
    return { status: "success", output: workflowOutput, triggerResults };
  } catch (err) {
    if (err instanceof WaitingForSignalError) {
      await updateExecution(env, executionId, {
        status: "enqueued",
        error: err instanceof Error ? err.message : String(err),
      });
      return { status: "waiting_for_signal", message: err.message };
    }
    if (err instanceof WorkflowCancelledError) {
      await updateExecution(env, executionId, {
        status: "cancelled",
        error: err instanceof Error ? err.message : String(err),
      });
      return { status: "cancelled", error: err.message };
    }
    if (err instanceof DurableSleepError) {
      await updateExecution(env, executionId, {
        status: "enqueued",
      });
      return { status: "durable_sleep", message: err.message };
    }
    console.error(`[WORKFLOW] Error executing workflow: ${err}`);
    await updateExecution(env, executionId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      completed_at_epoch_ms: Date.now(),
    });
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
