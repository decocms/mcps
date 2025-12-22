/**
 * Workflow Executor - Orchestrates parallel step execution based on DAG analysis
 */

import type { Env } from "../main.ts";
import type { Condition, RefContext } from "./utils/ref-resolver.ts";
import {
  evaluateCondition,
  resolveAllRefs,
  resolveRef,
} from "./utils/ref-resolver.ts";
import {
  getExecution,
  getStepResults,
  updateExecution,
  updateStepResult,
  createStepResult,
} from "../lib/execution-db.ts";
import type { Step as BaseStep } from "@decocms/bindings/workflow";
import { getWorkflow } from "server/tools/workflow/workflow.ts";
import { StepExecutor } from "./steps/step-executor.ts";
import {
  computeBranchMembership,
  groupStepsByLevel,
  validateNoCycles,
} from "./utils/dag.ts";
import {
  DurableSleepError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "./utils/errors.ts";

/**
 * Extended Step type that includes the optional "if" condition.
 * This ensures type safety for conditional step execution.
 */
type Step = BaseStep & {
  if?: Condition;
};

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
    await updateExecution(env, executionId, { status: "running" });
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
    await updateExecution(env, executionId, { status: "running" });
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

/**
 * Check if a step should be skipped based on its condition or branch membership.
 * A step is skipped if:
 * 1. It has an "if" condition that evaluates to false
 * 2. It belongs to a branch whose root was skipped
 */
function shouldSkipStep(
  step: Step,
  ctx: RefContext,
  skippedBranchRoots: Set<string>,
  branchMembership: Map<string, string | null>,
): { skip: boolean; reason?: string } {
  // Check if this step belongs to a skipped branch
  const branchRoot = branchMembership.get(step.name);
  if (branchRoot && skippedBranchRoots.has(branchRoot)) {
    return {
      skip: true,
      reason: `Branch root '${branchRoot}' condition was not satisfied`,
    };
  }

  // Check if this step has its own condition
  // Note: We access the raw property since TypeScript types don't guarantee runtime presence
  const condition = (step as unknown as { if?: Condition }).if;

  if (condition) {
    console.log(
      `[WORKFLOW] Evaluating condition for step '${step.name}':`,
      JSON.stringify(condition),
    );

    const result = evaluateCondition(condition, ctx);

    console.log(
      `[WORKFLOW] Condition result for step '${step.name}':`,
      JSON.stringify({
        satisfied: result.satisfied,
        leftValue: result.leftValue,
        rightValue: result.rightValue,
        error: result.error,
      }),
    );

    if (result.error) {
      console.warn(
        `[WORKFLOW] Condition evaluation error for step '${step.name}': ${result.error}`,
      );
      // On error, don't skip - let the step try to execute
      return { skip: false };
    }

    if (!result.satisfied) {
      return {
        skip: true,
        reason: `Condition not satisfied: ${condition.ref} ${condition.operator || "="} ${JSON.stringify(condition.value)} (was: ${JSON.stringify(result.leftValue)})`,
      };
    }
  }

  return { skip: false };
}

export async function executeWorkflow(env: Env, executionId: string) {
  try {
    const execution = await getExecution(env, executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== "running" && execution.status !== "enqueued") {
      throw new Error(`Execution ${executionId} is not running or enqueued`);
    }

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
    const allStepResults = await getStepResults(env, executionId);
    for (const sr of allStepResults) {
      if (sr.completed_at_epoch_ms && sr.output) {
        stepOutputs.set(sr.step_id, sr.output);
      }
    }

    const ctx: RefContext = { stepOutputs, workflowInput };
    const completedSteps: string[] = [];
    const skippedSteps: string[] = [];
    const alreadyCompleted = new Set(stepOutputs.keys());

    // Track which branch roots have been skipped
    const skippedBranchRoots = new Set<string>();

    // Compute branch membership for all steps
    const branchMembership = computeBranchMembership(steps);

    // Use workflow token for tool step authorization
    const stepExecutor = new StepExecutor(env);

    const validation = validateNoCycles(steps);
    if (!validation.isValid) throw new Error(validation.error);

    // Execute steps level by level (parallel within each level)
    for (const levelSteps of groupStepsByLevel(steps)) {
      // Mark already completed steps
      levelSteps
        .filter((s) => alreadyCompleted.has(s.name))
        .forEach((s) => completedSteps.push(s.name));

      const pending = levelSteps.filter((s) => !alreadyCompleted.has(s.name));
      if (!pending.length) continue;

      const results = await Promise.all(
        pending.map(async (step) => {
          // Debug: log step info and available step outputs
          const rawStep = step as unknown as Record<string, unknown>;
          console.log(
            `[WORKFLOW] Checking step '${step.name}':`,
            JSON.stringify({
              hasIfProperty: "if" in rawStep,
              ifValue: rawStep.if,
              availableOutputs: Array.from(ctx.stepOutputs.keys()),
            }),
          );

          // Check if step should be skipped based on condition
          const skipCheck = shouldSkipStep(
            step,
            ctx,
            skippedBranchRoots,
            branchMembership,
          );

          if (skipCheck.skip) {
            console.log(
              `[WORKFLOW] Skipping step '${step.name}': ${skipCheck.reason}`,
            );

            // If this step has an "if" condition, it's a branch root - track it
            if (step.if) {
              skippedBranchRoots.add(step.name);
            }

            // Record skipped step result
            await createStepResult(env, {
              execution_id: executionId,
              step_id: step.name,
              started_at_epoch_ms: Date.now(),
            });
            await updateStepResult(env, executionId, step.name, {
              output: { _skipped: true, reason: skipCheck.reason },
              completed_at_epoch_ms: Date.now(),
            });

            return { step, skipped: true, reason: skipCheck.reason };
          }

          // Execute the step
          if (step.config?.loop?.for) {
            const { outputs, stepIds } = await executeForEach(
              step,
              ctx,
              stepExecutor,
              executionId,
            );
            return { step, outputs, stepIds, isForEach: true, skipped: false };
          }

          const input = resolveAllRefs(step.input, ctx).resolved as Record<
            string,
            unknown
          >;
          const createdAt = allStepResults.find(
            (sr) => sr.step_id === step.name,
          )?.created_at as string;
          const createdAtDate = createdAt ? new Date(createdAt) : new Date();
          const startedAt = createdAtDate.getTime();

          const result = await stepExecutor.executeStep(
            step,
            input,
            ctx,
            executionId,
            { started_at_epoch_ms: startedAt },
          );

          if (!result.id) throw new Error(`Step result id is required`);
          return { step, result, isForEach: false, skipped: false };
        }),
      );

      for (const r of results) {
        if (r.skipped) {
          skippedSteps.push(r.step.name);
          // Set a marker in stepOutputs so dependent steps know this was skipped
          stepOutputs.set(r.step.name, { _skipped: true, reason: r.reason });
        } else if (r.isForEach) {
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
      skippedSteps,
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
