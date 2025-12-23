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
  updateStepResult,
  createStepResult,
} from "../lib/execution-db.ts";
import { StepExecutor } from "./steps/step-executor.ts";
import {
  computeBranchMembership,
  groupStepsByLevel,
  validateNoCycles,
} from "./utils/dag.ts";
import { ExecutionNotFoundError } from "./utils/errors.ts";
import {
  handleExecutionError,
  type ExecuteWorkflowResult,
} from "./error-handler.ts";
import { shouldSkipStep } from "./skip-logic.ts";
import { executeForEach } from "./foreach.ts";

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

    const branchMembership = computeBranchMembership(steps);
    const skippedBranchRoots = new Set<string>();
    const completedSteps: string[] = [];
    const skippedSteps: string[] = [];

    const stepExecutor = new StepExecutor(env, executionId);
    const allStepResults = await getStepResults(env, executionId);

    for (const levelSteps of groupStepsByLevel(steps)) {
      const { completed, pending } = partitionSteps(
        levelSteps,
        ctx.stepOutputs,
      );
      completedSteps.push(...completed.map((s) => s.name));

      if (!pending.length) continue;

      const results = await executeLevelSteps(
        pending,
        ctx,
        stepExecutor,
        executionId,
        env,
        skippedBranchRoots,
        branchMembership,
        allStepResults,
      );

      processResults(
        results,
        ctx.stepOutputs,
        completedSteps,
        skippedSteps,
        skippedBranchRoots,
      );
    }

    const output = buildOutput(completedSteps, skippedSteps);
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
    if (sr.completedAt && sr.output) {
      stepOutputs.set(sr.stepId, sr.output);
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
  skipped: boolean;
  reason?: string;
  result?: { output?: unknown; stepId: string };
  isForEach?: boolean;
  outputs?: unknown[];
  stepIds?: string[];
}

async function executeLevelSteps(
  steps: Step[],
  ctx: RefContext,
  stepExecutor: StepExecutor,
  executionId: string,
  env: Env,
  skippedBranchRoots: Set<string>,
  branchMembership: Map<string, string | null>,
  allStepResults: { stepId: string; startedAt?: number }[],
): Promise<StepExecutionResult[]> {
  return Promise.all(
    steps.map(async (step) => {
      const skipCheck = shouldSkipStep(
        step,
        ctx,
        skippedBranchRoots,
        branchMembership,
      );

      if (skipCheck.skip) {
        await recordSkippedStep(env, executionId, step, skipCheck.reason);
        return { step, skipped: true, reason: skipCheck.reason };
      }

      if (step.config?.loop?.for) {
        const { outputs, stepIds } = await executeForEach(
          step,
          ctx,
          stepExecutor,
          executionId,
        );
        return { step, skipped: false, isForEach: true, outputs, stepIds };
      }

      const input = resolveAllRefs(step.input, ctx).resolved as Record<
        string,
        unknown
      >;
      const existingResult = allStepResults.find(
        (sr) => sr.stepId === step.name,
      );
      const startedAt = existingResult?.startedAt ?? Date.now();

      const result = await stepExecutor.executeStep(step, input, {
        started_at_epoch_ms: startedAt,
      });

      if (!result.stepId) throw new Error(`Step result stepId is required`);
      return { step, skipped: false, result };
    }),
  );
}

async function recordSkippedStep(
  env: Env,
  executionId: string,
  step: Step,
  reason?: string,
): Promise<void> {
  await createStepResult(env, {
    execution_id: executionId,
    step_id: step.name,
    timeout_ms: step.config?.timeoutMs ?? 30000,
  });
  await updateStepResult(env, executionId, step.name, {
    output: { _skipped: true, reason },
    completed_at_epoch_ms: Date.now(),
  });
}

function processResults(
  results: StepExecutionResult[],
  stepOutputs: Map<string, unknown>,
  completedSteps: string[],
  skippedSteps: string[],
  skippedBranchRoots: Set<string>,
): void {
  for (const r of results) {
    if (r.skipped) {
      skippedSteps.push(r.step.name);
      stepOutputs.set(r.step.name, { _skipped: true, reason: r.reason });

      if (r.step.if) {
        skippedBranchRoots.add(r.step.name);
      }
    } else if (r.isForEach) {
      stepOutputs.set(r.step.name, r.outputs);
      completedSteps.push(...r.stepIds!);
    } else {
      stepOutputs.set(r.step.name, r.result!.output);
      completedSteps.push(r.result!.stepId);
    }
  }
}

function buildOutput(completedSteps: string[], skippedSteps: string[]) {
  return {
    _summary: true,
    completedSteps,
    skippedSteps,
    lastStep: completedSteps[completedSteps.length - 1],
    message: "Full outputs available in step results",
  };
}
