/**
 * Workflow Executor
 *
 * Orchestrates parallel step execution based on DAG analysis.
 */

import {
  groupStepsByLevel,
  validateNoCycles,
} from "@decocms/bindings/workflow";
import {
  claimExecution,
  getStepResults,
  updateExecution,
  updateStepResult,
} from "../db/queries/executions.ts";
import type { Env } from "../types/env.ts";
import type { Step, StepResult } from "../types/step.ts";
import { ExecutionNotFoundError, StepExecutionError } from "../utils/errors.ts";
import type { RefContext } from "../utils/ref-resolver.ts";
import { resolveAllRefs } from "../utils/ref-resolver.ts";
import {
  type ExecuteWorkflowResult,
  handleExecutionError,
} from "./error-handler.ts";
import { StepExecutor } from "./steps/step-executor.ts";

export type { ExecuteWorkflowResult };

export async function executeWorkflow(
  env: Env,
  executionId: string,
): Promise<ExecuteWorkflowResult> {
  try {
    console.log(`[WORKFLOW] Starting execution: ${executionId}`);
    const execution = await claimExecution(env, executionId);
    if (!execution) throw new ExecutionNotFoundError(executionId);

    console.log(`[WORKFLOW] Claimed execution:`, {
      id: execution.id,
      workflow_id: execution.workflow_id,
      gateway_id: execution.gateway_id,
      status: execution.status,
      stepsCount: execution.steps?.length ?? 0,
      hasInput: !!execution.input,
    });

    // Steps and gateway_id are now on the joined workflow data
    const steps = execution.steps as Step[];
    if (!steps || steps.length === 0) {
      console.error(`[WORKFLOW] No steps found in execution:`, execution);
      throw new Error(
        `Workflow has no steps. Execution data: ${JSON.stringify(execution)}`,
      );
    }

    const workflowInput = parseInput(execution.input);
    console.log(`[WORKFLOW] Parsed input:`, workflowInput);
    const ctx = await buildContext(env, executionId, workflowInput);

    const validation = validateNoCycles(steps);
    if (!validation.isValid) throw new Error(validation.error);

    const completedSteps: string[] = [];

    const stepExecutor = new StepExecutor(
      env,
      executionId,
      execution.gateway_id, // Now comes from joined workflow data
    );

    for (const levelSteps of groupStepsByLevel(steps)) {
      const { completed, pending } = partitionSteps(
        levelSteps,
        ctx.stepOutputs,
      );
      completedSteps.push(...completed.map((s) => s.name));

      if (!pending.length) continue;

      const results = await executeLevelSteps({
        executionId,
        steps: pending,
        ctx,
        stepExecutor,
        env,
      });

      processResults(results, ctx.stepOutputs, completedSteps, executionId);
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
    console.error(`[WORKFLOW] Error executing workflow ${executionId}:`, err);
    if (err instanceof Error) {
      console.error(`[WORKFLOW] Error stack:`, err.stack);
    }
    return await handleExecutionError(env, executionId, err);
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
  result?: StepResult;
}

async function executeLevelSteps({
  executionId,
  steps,
  ctx,
  stepExecutor,
  env,
}: {
  executionId: string;
  steps: Step[];
  ctx: RefContext;
  stepExecutor: StepExecutor;
  env: Env;
}): Promise<StepExecutionResult[]> {
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

      try {
        const result = await stepExecutor.executeStep(step, input, {
          started_at_epoch_ms: startedAt,
        });
        console.log("Step executed", step.name, result);
        return { step, result };
      } catch (err) {
        console.error("Step failed", step.name, err);
        updateStepResult(env, executionId, step.name, {
          error: err instanceof Error ? err.message : String(err),
          completed_at_epoch_ms: Date.now(),
        });
        throw err;
      }
    }),
  );
}

function processResults(
  results: StepExecutionResult[],
  stepOutputs: Map<string, unknown>,
  completedSteps: string[],
  executionId: string,
): void {
  // Check for any step failures
  const failedStep = results.find((r) => r.result?.error);
  if (failedStep && failedStep.result?.error) {
    throw new StepExecutionError(
      executionId,
      failedStep.step.name,
      failedStep.result.error,
    );
  }

  for (const r of results) {
    stepOutputs.set(r.step.name, r.result?.output ?? undefined);
    completedSteps.push(r.step.name);
  }
}

function buildOutput(completedSteps: string[], output: unknown) {
  return {
    completedSteps,
    output,
  };
}
