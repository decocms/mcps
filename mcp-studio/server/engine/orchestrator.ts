/**
 * Workflow Orchestrator
 *
 * Event-driven workflow execution engine.
 * All steps are fire-and-forget via the event bus.
 */

import { validateNoCycles } from "@decocms/bindings/workflow";
import {
  claimExecution,
  createStepResult,
  getExecutionContext,
  getStepResultsByPrefix,
  updateExecution,
  updateStepResult,
} from "../db/queries/executions.ts";
import type { Step } from "../types/step.ts";
import { getStepType } from "../types/step.ts";
import {
  extractRefs,
  parseAtRef,
  resolveAllRefs,
} from "../utils/ref-resolver.ts";
import { ExecutionContext } from "./context.ts";
import { executeCode } from "./steps/code-step.ts";
import { executeToolStep } from "./steps/tool-step.ts";
import type { Env } from "../types/env.ts";
import { WorkflowExecutionStepResult } from "server/db/transformers.ts";

/**
 * Publish an event to the event bus (fire-and-forget)
 */
async function publishEvent(
  env: Env,
  type: string,
  subject: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await env.MESH_REQUEST_CONTEXT.state.EVENT_BUS.EVENT_PUBLISH({
    type,
    subject,
    data,
  });
}

/**
 * Extract step dependencies from refs in step input and forEach config.
 * Dependencies are inferred from @stepName refs.
 */
function getStepDependencies(step: Step): string[] {
  const refs = extractRefs(step.input);

  // Also include forEach ref as a dependency
  if (step.forEach?.ref) {
    refs.push(step.forEach.ref);
  }

  const deps = new Set<string>();

  for (const ref of refs) {
    if (ref.startsWith("@")) {
      const parsed = parseAtRef(ref as `@${string}`);
      if (parsed.type === "step" && parsed.stepName) {
        deps.add(parsed.stepName);
      }
    }
  }

  console.log("🚀 ~ getStepDependencies: ~ deps:", { deps: Array.from(deps) });

  return Array.from(deps);
}

/**
 * Check if a step has forEach configuration
 */
function isForEachStep(step: Step): boolean {
  return !!step.forEach?.ref;
}

/**
 * Get steps that are ready to execute (all dependencies satisfied)
 */
function getReadySteps(
  steps: Step[],
  completedStepNames: Set<string>,
  claimedStepNames: Set<string>,
): Step[] {
  return steps.filter((step) => {
    // Already completed or claimed
    if (completedStepNames.has(step.name) || claimedStepNames.has(step.name)) {
      return false;
    }

    // Check if all dependencies are satisfied
    const deps = getStepDependencies(step);
    return deps.every((dep) => completedStepNames.has(dep));
  });
}

/**
 * Handle workflow.execution.created event
 *
 * Claims the execution and dispatches events for all ready steps.
 * If resuming a cancelled execution, continues from where it left off.
 */
export async function handleExecutionCreated(
  env: Env,
  executionId: string,
): Promise<void> {
  const execution = await claimExecution(env, executionId);
  if (!execution) {
    console.log(
      `[ORCHESTRATOR] Could not claim execution ${executionId} (already claimed or not found)`,
    );
    return;
  }

  const steps = execution.steps as Step[];
  if (!steps?.length) {
    console.error(`[ORCHESTRATOR] No steps found for execution ${executionId}`);
    await updateExecution(env, executionId, {
      status: "error",
      error: "Workflow has no steps",
      completed_at_epoch_ms: Date.now(),
    });
    return;
  }

  // Validate DAG
  const validation = validateNoCycles(steps);
  if (!validation.isValid) {
    await updateExecution(env, executionId, {
      status: "error",
      error: validation.error,
      completed_at_epoch_ms: Date.now(),
    });
    return;
  }

  // Parse input
  const workflowInput =
    typeof execution.input === "string"
      ? JSON.parse(execution.input)
      : (execution.input ?? {});

  // Find ready steps (respecting already completed/claimed steps)
  const readySteps = getReadySteps(steps, new Set<string>(), new Set<string>());

  // Dispatch step.execute events for all ready steps (including forEach steps)
  const stepOutputs = new Map<string, unknown>();
  await Promise.all(
    readySteps.map((step) =>
      dispatchStep(env, executionId, step, workflowInput, stepOutputs).catch(
        (error: Error) => {
          console.error(
            `[ORCHESTRATOR] Failed to dispatch step ${executionId}/${step.name}:`,
            error,
          );
        },
      ),
    ),
  );
}

/**
 * Handle workflow.step.execute event
 *
 * Claims the step, executes it, and publishes step.completed.
 * Supports forEach iterations via iterationIndex and item parameters.
 */
export async function handleStepExecute(
  env: Env,
  executionId: string,
  stepName: string,
  input: Record<string, unknown>,
  iterationIndex?: number,
  item?: unknown,
): Promise<void> {
  const isIteration = iterationIndex !== undefined;
  const stepId = isIteration ? `${stepName}[${iterationIndex}]` : stepName;

  console.log(`[ORCHESTRATOR] Executing step: ${executionId}/${stepId}`);

  // Get execution context in a single query (optimized)
  const context = await getExecutionContext(env, executionId);
  if (!context || context.execution.status !== "running") {
    console.log(
      `[ORCHESTRATOR] Execution ${executionId} is not running, skipping step ${stepId}`,
    );
    return;
  }

  const steps = context.workflow.steps as Step[];
  const step = steps.find((s) => s.name === stepName);
  if (!step) {
    console.error(
      `[ORCHESTRATOR] Step ${stepName} not found in workflow ${context.execution.workflow_id}`,
    );
    return;
  }

  // Claim step/iteration (creates record, returns null if already claimed)
  const claimed = await createStepResult(env, {
    execution_id: executionId,
    step_id: stepId,
  });

  if (!claimed) {
    console.log(
      `[ORCHESTRATOR] Step ${stepId} already claimed, skipping execution`,
    );
    return;
  }

  // For iterations, resolve input with @item and @index context
  let resolvedInput = input;
  if (isIteration) {
    const stepOutputs = new Map<string, unknown>();
    for (const result of context.stepResults) {
      if (result.completed_at_epoch_ms) {
        stepOutputs.set(result.step_id, result.output);
      }
    }

    const { resolved } = resolveAllRefs(step.input, {
      workflowInput: context.workflow.input ?? {},
      stepOutputs,
      item,
      index: iterationIndex,
    });
    resolvedInput = resolved as Record<string, unknown>;
  }

  // Execute the step
  const ctx = new ExecutionContext(
    env,
    executionId,
    context.workflow.gateway_id,
  );
  const stepType = getStepType(step);

  let output: unknown;
  let error: string | undefined;

  try {
    if (stepType === "tool") {
      const result = await executeToolStep(ctx, step, resolvedInput);
      output = result.output;
      error = result.error;
    } else if (stepType === "code" && "code" in step.action) {
      const result = await executeCode(step.action.code, resolvedInput, stepId);
      output = result.output;
      error = result.error;
    } else {
      error = `Unknown step type for step ${stepName}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Publish step.completed event with iteration context
  await publishEvent(env, "workflow.step.completed", executionId, {
    stepName,
    iterationIndex,
    output,
    error,
  });
}

/**
 * Handle workflow.step.completed event
 *
 * Updates step result, finds newly ready steps, checks if workflow is complete.
 * Supports forEach iterations via iterationIndex parameter.
 */

type OnError = "fail" | "continue";

/**
 * Build a map of step outputs from step results
 */
function buildStepOutputsMap(
  stepResults: WorkflowExecutionStepResult[],
): Map<string, unknown> {
  const stepOutputs = new Map<string, unknown>();
  for (const result of stepResults) {
    if (result.completed_at_epoch_ms) {
      stepOutputs.set(result.step_id, result.output);
    }
  }
  return stepOutputs;
}

/**
 * Build sets tracking completed and in-progress steps (excludes iteration results)
 */
function buildOrchestrationSets(stepResults: WorkflowExecutionStepResult[]): {
  completedStepNames: Set<string>;
  claimedStepNames: Set<string>;
  stepOutputs: Map<string, unknown>;
} {
  const completedStepNames = new Set<string>();
  const claimedStepNames = new Set<string>();
  const stepOutputs = new Map<string, unknown>();

  for (const result of stepResults) {
    // Skip iteration results (they have [N] suffix)
    if (result.step_id.includes("[")) continue;

    if (result.completed_at_epoch_ms) {
      completedStepNames.add(result.step_id);
      stepOutputs.set(result.step_id, result.output);
    } else {
      claimedStepNames.add(result.step_id);
    }
  }

  return { completedStepNames, claimedStepNames, stepOutputs };
}

/**
 * Handle step error - fails the workflow if appropriate
 * Returns true if workflow execution should continue, false if it should stop
 */
async function handleStepError(
  env: Env,
  executionId: string,
  stepId: string,
  error: string,
  isIteration: boolean,
  onError: OnError,
): Promise<boolean> {
  if (isIteration && onError === "continue") {
    console.log(
      `[ORCHESTRATOR] Iteration ${stepId} failed but onError: "continue", collecting error`,
    );
    return true;
  }

  // Fail the workflow (default behavior for regular steps or onError: "fail")
  const updated = await updateExecution(
    env,
    executionId,
    {
      status: "error",
      error: `Step "${stepId}" failed: ${error}`,
      completed_at_epoch_ms: Date.now(),
    },
    { onlyIfStatus: "running" },
  );

  if (updated) {
    console.log(
      `[ORCHESTRATOR] Workflow ${executionId} failed: step ${stepId} error`,
    );
  }

  // For forEach with onError: "fail", continue to handle iteration completion
  return isIteration;
}

/**
 * Check if workflow is complete and mark it as successful
 * Returns true if workflow was completed, false otherwise
 */
async function checkAndCompleteWorkflow(
  env: Env,
  executionId: string,
  steps: Step[],
  completedStepNames: Set<string>,
  stepOutputs: Map<string, unknown>,
  lastStepName: string,
): Promise<boolean> {
  if (completedStepNames.size !== steps.length) {
    return false;
  }

  const lastOutput = stepOutputs.get(lastStepName);

  // Atomic update: only succeeds if status is still "running" (prevents race condition)
  const updated = await updateExecution(
    env,
    executionId,
    {
      status: "success",
      output: lastOutput,
      completed_at_epoch_ms: Date.now(),
    },
    { onlyIfStatus: "running" },
  );

  if (updated) {
    console.log(`[ORCHESTRATOR] Workflow ${executionId} completed`);
  }

  return true;
}

/**
 * Find and dispatch ready steps
 */
async function dispatchReadySteps(
  env: Env,
  executionId: string,
  steps: Step[],
  completedStepNames: Set<string>,
  claimedStepNames: Set<string>,
  workflowInput: Record<string, unknown>,
  stepOutputs: Map<string, unknown>,
): Promise<void> {
  const readySteps = getReadySteps(steps, completedStepNames, claimedStepNames);

  if (readySteps.length === 0) {
    console.log(
      `[ORCHESTRATOR] No new steps ready, waiting for in-flight steps`,
    );
    return;
  }

  console.log(
    `[ORCHESTRATOR] Dispatching ${readySteps.length} steps:`,
    readySteps.map((s) => s.name),
  );

  await Promise.all(
    readySteps.map((step) =>
      dispatchStep(env, executionId, step, workflowInput, stepOutputs),
    ),
  );
}

/**
 * Aggregate iteration results into parent step output
 */
function aggregateIterationResults(
  iterationResults: WorkflowExecutionStepResult[],
  onError: OnError,
): { success: unknown[]; error: string[] | undefined } {
  const completedIterations = iterationResults.filter(
    (r) => r.completed_at_epoch_ms,
  );
  const success: unknown[] = [];
  const error: string[] = [];

  for (const ir of completedIterations) {
    if (ir.error) {
      error.push(String(ir.error));
    } else {
      success.push(ir.output);
    }
  }

  const parentError =
    onError === "fail" && error.length > 0 ? error : undefined;

  return { success, error: parentError };
}

/**
 * Handle forEach iteration completion
 * Returns true if handled (caller should return), false if not a forEach iteration
 */
async function handleForEachIterationCompletion(
  env: Env,
  executionId: string,
  stepName: string,
  step: Step,
  stepResults: WorkflowExecutionStepResult[],
  workflowInput: Record<string, unknown>,
  isWorkflowRunning: boolean,
): Promise<void> {
  const onError = "continue" as OnError;
  const stepOutputs = buildStepOutputsMap(stepResults);

  // Resolve forEach ref to get total items
  const { resolved } = resolveAllRefs(
    { items: step.forEach!.ref },
    { workflowInput, stepOutputs },
  );
  const items = (resolved as { items: unknown[] }).items;

  if (!Array.isArray(items)) {
    console.error(
      `[ORCHESTRATOR] forEach ref did not resolve to array: ${step.forEach!.ref}`,
    );
    return;
  }

  const totalIterations = items.length;

  // Get all iteration results for this step
  const iterationResults = await getStepResultsByPrefix(
    env,
    executionId,
    `${stepName}[`,
  );
  const completedIterations = iterationResults.filter(
    (r) => r.completed_at_epoch_ms,
  );
  const failedIterations = completedIterations.filter((r) => r.error);
  const successfulIterations = completedIterations.filter((r) => !r.error);

  console.log(
    `[ORCHESTRATOR] forEach ${stepName}: ${completedIterations.length}/${totalIterations} iterations complete (${successfulIterations.length} success, ${failedIterations.length} failed)`,
  );

  // Check if all iterations are complete
  if (completedIterations.length === totalIterations) {
    const { success, error } = aggregateIterationResults(
      iterationResults,
      onError,
    );

    await updateStepResult(env, executionId, stepName, {
      output: success,
      error: error ? error.join(", ") : undefined,
      completed_at_epoch_ms: Date.now(),
    });

    console.log(
      `[ORCHESTRATOR] forEach ${stepName} completed with ${totalIterations} iterations (${successfulIterations.length} success, ${failedIterations.length} failed)`,
    );

    // Continue with normal completion flow (find next ready steps)
    if (isWorkflowRunning) {
      await orchestrateAfterStepCompletion(
        env,
        executionId,
        stepName,
        success,
        error ? error.join(", ") : undefined,
      );
    } else {
      console.log(
        `[ORCHESTRATOR] forEach ${stepName} completed but workflow not running, skipping next steps`,
      );
    }
    return;
  }

  // Dispatch next iteration if using limited concurrency
  await maybeDispatchNextIteration(
    env,
    executionId,
    stepName,
    step,
    items,
    iterationResults,
    completedIterations,
    failedIterations,
    isWorkflowRunning,
    onError,
  );
}

/**
 * Dispatch next forEach iteration if concurrency allows
 */
async function maybeDispatchNextIteration(
  env: Env,
  executionId: string,
  stepName: string,
  step: Step,
  items: unknown[],
  iterationResults: WorkflowExecutionStepResult[],
  completedIterations: WorkflowExecutionStepResult[],
  failedIterations: WorkflowExecutionStepResult[],
  isWorkflowRunning: boolean,
  onError: OnError,
): Promise<void> {
  const totalIterations = items.length;
  const shouldContinue =
    isWorkflowRunning &&
    (onError === "continue" || failedIterations.length === 0);

  if (!shouldContinue) {
    if (!isWorkflowRunning) {
      console.log(
        `[ORCHESTRATOR] Not dispatching more iterations for ${stepName} - workflow not running`,
      );
    } else {
      console.log(
        `[ORCHESTRATOR] Not dispatching more iterations for ${stepName} due to failure (onError: ${onError})`,
      );
    }
    return;
  }

  const concurrency = step.forEach!.concurrency ?? totalIterations;
  const inFlightCount = iterationResults.length - completedIterations.length;
  const nextIndex = iterationResults.length;

  if (inFlightCount < concurrency && nextIndex < totalIterations) {
    console.log(
      `[ORCHESTRATOR] Dispatching next iteration: ${stepName}[${nextIndex}]`,
    );

    await publishEvent(env, "workflow.step.execute", executionId, {
      stepName,
      iterationIndex: nextIndex,
      item: items[nextIndex],
      input: step.input,
    });
  }
}

/**
 * Orchestrate after a regular step completes - check workflow completion and dispatch next steps
 */
async function orchestrateAfterStepCompletion(
  env: Env,
  executionId: string,
  stepName: string,
  _output: unknown,
  _error: string | undefined,
): Promise<void> {
  const context = await getExecutionContext(env, executionId);
  if (!context) {
    console.log(`[ORCHESTRATOR] Execution ${executionId} not found`);
    return;
  }

  if (context.execution.status !== "running") {
    console.log(
      `[ORCHESTRATOR] Workflow ${executionId} not running, skipping orchestration`,
    );
    return;
  }

  const { workflow, stepResults } = context;
  const steps = workflow.steps as Step[];
  const workflowInput = workflow.input ?? {};

  const { completedStepNames, claimedStepNames, stepOutputs } =
    buildOrchestrationSets(stepResults);

  // Check if workflow is complete
  const completed = await checkAndCompleteWorkflow(
    env,
    executionId,
    steps,
    completedStepNames,
    stepOutputs,
    stepName,
  );

  if (completed) {
    return;
  }

  // Find and dispatch ready steps
  await dispatchReadySteps(
    env,
    executionId,
    steps,
    completedStepNames,
    claimedStepNames,
    workflowInput,
    stepOutputs,
  );
}

/**
 * Main handler for workflow.step.completed event
 */
export async function handleStepCompleted(
  env: Env,
  executionId: string,
  stepName: string,
  output: unknown,
  error: string | undefined,
  iterationIndex?: number,
): Promise<void> {
  const isIteration = iterationIndex !== undefined;
  const stepId = isIteration ? `${stepName}[${iterationIndex}]` : stepName;

  console.log(
    `[ORCHESTRATOR] Step completed: ${executionId}/${stepId}`,
    error ? `(error: ${error})` : "(success)",
  );

  // 1. Persist step result
  await updateStepResult(env, executionId, stepId, {
    output,
    error,
    completed_at_epoch_ms: Date.now(),
  });

  // 2. Get execution context
  const context = await getExecutionContext(env, executionId);
  if (!context) {
    console.log(`[ORCHESTRATOR] Execution ${executionId} not found`);
    return;
  }

  const isWorkflowRunning = context.execution.status === "running";
  const { workflow, stepResults } = context;
  const steps = workflow.steps as Step[];
  const workflowInput = workflow.input ?? {};

  // 3. Handle step error if present
  if (error && isWorkflowRunning) {
    const onError = "continue" as OnError;
    const shouldContinue = await handleStepError(
      env,
      executionId,
      stepId,
      error,
      isIteration,
      onError,
    );
    if (!shouldContinue) {
      return;
    }
  }

  // 4. Handle forEach iteration completion
  if (isIteration) {
    const step = steps.find((s) => s.name === stepName);
    if (!step?.forEach) {
      console.error(
        `[ORCHESTRATOR] Iteration completed for non-forEach step: ${stepName}`,
      );
      return;
    }

    await handleForEachIterationCompletion(
      env,
      executionId,
      stepName,
      step,
      stepResults,
      workflowInput,
      isWorkflowRunning,
    );
    return;
  }

  // 5. Orchestrate next steps (for regular step completion)
  if (!isWorkflowRunning) {
    console.log(
      `[ORCHESTRATOR] Workflow ${executionId} not running, skipping orchestration (result persisted)`,
    );
    return;
  }

  const { completedStepNames, claimedStepNames, stepOutputs } =
    buildOrchestrationSets(stepResults);

  // 6. Check workflow completion
  const completed = await checkAndCompleteWorkflow(
    env,
    executionId,
    steps,
    completedStepNames,
    stepOutputs,
    stepName,
  );
  if (completed) {
    return;
  }

  // 7. Dispatch ready steps
  await dispatchReadySteps(
    env,
    executionId,
    steps,
    completedStepNames,
    claimedStepNames,
    workflowInput,
    stepOutputs,
  );
}

/**
 * Dispatch a step for execution.
 * For forEach steps, dispatches initial batch of iterations.
 * For regular steps, dispatches single execution.
 */
async function dispatchStep(
  env: Env,
  executionId: string,
  step: Step,
  workflowInput: Record<string, unknown>,
  stepOutputs: Map<string, unknown>,
): Promise<void> {
  if (isForEachStep(step)) {
    // Resolve forEach ref to get items array
    const { resolved } = resolveAllRefs(
      { items: step.forEach!.ref },
      { workflowInput, stepOutputs },
    );
    const items = (resolved as { items: unknown[] }).items;

    if (!Array.isArray(items)) {
      console.error(
        `[ORCHESTRATOR] forEach ref must resolve to array: ${step.forEach!.ref}`,
      );
      // Create parent step with error
      await createStepResult(env, {
        execution_id: executionId,
        step_id: step.name,
        error: `forEach ref did not resolve to array: ${step.forEach!.ref}`,
        completed_at_epoch_ms: Date.now(),
      });
      return;
    }

    if (items.length === 0) {
      // Empty array - complete immediately with empty result
      await createStepResult(env, {
        execution_id: executionId,
        step_id: step.name,
        output: {},
        completed_at_epoch_ms: Date.now(),
      });
      console.log(
        `[ORCHESTRATOR] forEach ${step.name} completed immediately (empty array)`,
      );
      return;
    }

    // Claim parent step (prevents re-dispatch on duplicate events)
    const parentClaimed = await createStepResult(env, {
      execution_id: executionId,
      step_id: step.name,
    });

    if (!parentClaimed) {
      console.log(
        `[ORCHESTRATOR] forEach ${step.name} already dispatched, skipping`,
      );
      return;
    }

    // Dispatch initial batch of iterations
    const concurrency = step.forEach!.concurrency ?? items.length;
    const initialBatch = items.slice(0, concurrency);

    console.log(
      `[ORCHESTRATOR] Dispatching forEach ${step.name}: ${initialBatch.length} iterations (concurrency: ${concurrency}, total: ${items.length})`,
    );

    await Promise.all(
      initialBatch.map((item, index) =>
        publishEvent(env, "workflow.step.execute", executionId, {
          stepName: step.name,
          iterationIndex: index,
          item,
          input: step.input,
        }),
      ),
    );
  } else {
    // Regular step dispatch
    const { resolved } = resolveAllRefs(step.input, {
      workflowInput,
      stepOutputs,
    });

    await publishEvent(env, "workflow.step.execute", executionId, {
      stepName: step.name,
      input: resolved,
    });
  }
}
