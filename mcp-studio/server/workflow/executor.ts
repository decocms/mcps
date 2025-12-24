/**
 * Workflow Executor
 *
 * Orchestrates parallel step execution based on DAG analysis.
 */

import type { Env } from "../types/env.ts";
import type { Step } from "../types/step-types.ts";
import type { RefContext } from "./utils/ref-resolver.ts";
import { resolveAllRefs } from "./utils/ref-resolver.ts";
import {
  claimExecution,
  getStepResults,
  updateExecution,
} from "../lib/execution-db.ts";
import { StepExecutor } from "./steps/step-executor.ts";
import { ExecutionNotFoundError } from "./utils/errors.ts";
import {
  handleExecutionError,
  type ExecuteWorkflowResult,
} from "./error-handler.ts";
import {
  groupStepsByLevel,
  validateNoCycles,
} from "@decocms/bindings/workflow";

export type { ExecuteWorkflowResult };

export async function executeWorkflow(
  env: Env,
  executionId: string,
): Promise<ExecuteWorkflowResult> {
  try {
    const execution = await claimExecution(env, executionId);
    if (!execution) throw new ExecutionNotFoundError(executionId);

    const steps = execution.steps as Step[];
    const workflowInput = parseInput(execution.input);
    const ctx = await buildContext(env, executionId, workflowInput);

    const validation = validateNoCycles(steps);
    if (!validation.isValid) throw new Error(validation.error);

    const completedSteps: string[] = [];

    const stepExecutor = new StepExecutor(env, executionId);

    for (const levelSteps of groupStepsByLevel(steps)) {
      const { completed, pending } = partitionSteps(
        levelSteps,
        ctx.stepOutputs,
      );
      completedSteps.push(...completed.map((s) => s.name));

      if (!pending.length) continue;

      const results = await executeLevelSteps(pending, ctx, stepExecutor);

      processResults(results, ctx.stepOutputs, completedSteps);
    }

    const lastStepResult = await stepExecutor.getLastStepResult();

    const output = buildOutput(completedSteps, lastStepResult?.output);
    await updateExecution(env, executionId, {
      status: "success",
      output,
      completed_at_epoch_ms: Date.now(),
    });

    return { status: "success", output };
  } catch (err) {
    console.error(`[WORKFLOW] Error executing workflow: ${err}`);
    return handleExecutionError(env, executionId, err);
  }
}

function parseInput(input: unknown): Record<string, unknown> {
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return (input as Record<string, unknown>) || {};
}

async function buildContext(
  env: Env,
  executionId: string,
  workflowInput: Record<string, unknown>,
): Promise<RefContext & { stepOutputs: Map<string, unknown> }> {
  const stepOutputs = new Map<string, unknown>();
  const allStepResults = await getStepResults(env, executionId);
  for (const sr of allStepResults) {
    if (sr.completed_at_epoch_ms && sr.output) {
      stepOutputs.set(sr.step_id, sr.output);
    }
  }

  return { stepOutputs, workflowInput };
}

function partitionSteps(
  steps: Step[],
  completedOutputs: Map<string, unknown>,
): { completed: Step[]; pending: Step[] } {
  const completed = steps.filter((s) => completedOutputs.has(s.name));
  const pending = steps.filter((s) => !completedOutputs.has(s.name));
  return { completed, pending };
}

interface StepExecutionResult {
  step: Step;
  result?: { output?: unknown; stepId: string };
}

async function executeLevelSteps(
  steps: Step[],
  ctx: RefContext,
  stepExecutor: StepExecutor,
): Promise<StepExecutionResult[]> {
  return Promise.all(
    steps.map(async (step) => {
      const input = resolveAllRefs(step.input, ctx).resolved as Record<
        string,
        unknown
      >;
      const existingResult = ctx.stepOutputs.get(step.name) as
        | { startedAt: number }
        | undefined;
      const startedAt = existingResult
        ? new Date(existingResult.startedAt).getTime()
        : Date.now();

      const result = await stepExecutor.executeStep(step, input, {
        started_at_epoch_ms: startedAt,
      });

      if (!result.stepId) throw new Error(`Step result stepId is required`);
      return { step, result };
    }),
  );
}

function processResults(
  results: StepExecutionResult[],
  stepOutputs: Map<string, unknown>,
  completedSteps: string[],
): void {
  for (const r of results) {
    stepOutputs.set(r.step.name, r.result!.output);
    completedSteps.push(r.result!.stepId);
  }
}

function buildOutput(completedSteps: string[], output: unknown) {
  return {
    completedSteps,
    output,
  };
}
