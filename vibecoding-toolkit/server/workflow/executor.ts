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
import { getStepResults, updateExecution } from "../lib/execution-db.ts";
import { lockWorkflowExecution, releaseLock } from "./lock.ts";
import type { Step, Trigger } from "@decocms/bindings/workflow";
import { getWorkflow } from "server/tools/workflow.ts";
import { StepExecutor, StepResult } from "./steps/step-executor.ts";

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
  const config = step.config!.forEach!;
  const items = parseForEachItems(
    resolveRef(config.items as `@${string}`, ctx).value,
  );

  const mode = config.mode ?? "sequential";
  const concurrency = config.maxConcurrency ?? items.length;

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

  if (mode === "sequential") {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      results.push(await executeItem(items[i], i));
    }
    return {
      outputs: results.map((r) => r.output),
      stepIds: results.map((r) => r.id!),
    };
  }

  // Parallel with concurrency limit
  const results: StepResult[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, j) => executeItem(item, i + j)),
    );
    results.push(...batchResults);
  }

  return {
    outputs: results.map((r) => r.output),
    stepIds: results.map((r) => r.id!),
  };
}

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export async function executeWorkflow(env: Env, executionId: string) {
  let lockId: string | undefined;

  try {
    // Acquire lock
    const { lockedExecution } = await lockWorkflowExecution(env, executionId, {
      durationMs: DEFAULT_LOCK_DURATION_MS,
    });
    lockId = lockedExecution.lockId;
    // Load workflow definition
    const workflow = await getWorkflow(env, lockedExecution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${lockedExecution.workflowId} not found`);
    }

    const parsedSteps = workflow.steps
      ? typeof workflow.steps === "string"
        ? JSON.parse(workflow.steps)
        : workflow.steps
      : [];

    const steps = parsedSteps as Step[];

    const triggers: Trigger[] = workflow.triggers || [];
    const workflowInput =
      typeof lockedExecution.input === "string"
        ? JSON.parse(lockedExecution.input)
        : lockedExecution.input || {};

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

    const stepExecutor = new StepExecutor(env);
    for (const step of steps) {
      if (step.config?.forEach) {
        const { outputs, stepIds } = await executeForEach(
          step,
          ctx,
          stepExecutor,
          executionId,
        );
        stepOutputs.set(step.name, outputs);
        completedSteps.push(...stepIds);
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
        stepOutputs.set(step.name, result.output);
        completedSteps.push(result.id);
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
    await updateExecution(env, lockedExecution.id, {
      status: "completed",
      output: workflowOutput,
      completed_at_epoch_ms: Date.now(),
      retry_count: 0,
    });
    return { status: "completed", output: workflowOutput, triggerResults };
  } catch (err) {
    console.error(`[WORKFLOW] Error executing workflow: ${err}`);
  } finally {
    if (lockId) await releaseLock(env, executionId, lockId);
  }
}
