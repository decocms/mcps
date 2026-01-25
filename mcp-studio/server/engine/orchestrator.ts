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
  updateExecution,
  updateStepResult,
} from "../db/queries/executions.ts";
import type { Env } from "../types/env.ts";
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

/**
 * Publish an event to the event bus (fire-and-forget)
 */
async function publishEvent(
  env: Env,
  type: string,
  subject: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS?.EVENT_PUBLISH({
    type,
    subject,
    data,
  });
}

/**
 * Extract step dependencies from refs in step input.
 * Dependencies are inferred from @stepName refs.
 */
function getStepDependencies(step: Step): string[] {
  const refs = extractRefs(step.input);
  const deps = new Set<string>();

  for (const ref of refs) {
    if (ref.startsWith("@")) {
      const parsed = parseAtRef(ref as `@${string}`);
      if (parsed.type === "step" && parsed.stepName) {
        deps.add(parsed.stepName);
      }
    }
  }

  return Array.from(deps);
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

  // Dispatch step.execute events for all ready steps
  for (const step of readySteps) {
    // Resolve input refs using completed step outputs
    const { resolved } = resolveAllRefs(step.input, {
      workflowInput,
      stepOutputs: new Map<string, unknown>(),
    });

    publishEvent(env, "workflow.step.execute", executionId, {
      stepName: step.name,
      input: resolved,
    }).catch((error: Error) => {
      console.error(
        `[ORCHESTRATOR] Failed to publish step.execute event for ${executionId}/${step.name}:`,
        error,
      );
    });
  }
}

/**
 * Handle workflow.step.execute event
 *
 * Claims the step, executes it, and publishes step.completed.
 */
export async function handleStepExecute(
  env: Env,
  executionId: string,
  stepName: string,
  input: Record<string, unknown>,
): Promise<void> {
  console.log(`[ORCHESTRATOR] Executing step: ${executionId}/${stepName}`);

  // Get execution context in a single query (optimized)
  const context = await getExecutionContext(env, executionId);
  if (!context || context.execution.status !== "running") {
    console.log(
      `[ORCHESTRATOR] Execution ${executionId} is not running, skipping step ${stepName}`,
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

  // Claim step (creates record, returns null if already claimed)
  const claimed = await createStepResult(env, {
    execution_id: executionId,
    step_id: stepName,
  });

  if (!claimed) {
    console.log(
      `[ORCHESTRATOR] Step ${stepName} already claimed, skipping execution`,
    );
    return;
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
      const result = await executeToolStep(ctx, step, input);
      output = result.output;
      error = result.error;
    } else if (stepType === "code" && "code" in step.action) {
      const result = await executeCode(step.action.code, input, stepName);
      output = result.output;
      error = result.error;
    } else {
      error = `Unknown step type for step ${stepName}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Publish step.completed event
  await publishEvent(env, "workflow.step.completed", executionId, {
    stepName,
    output,
    error,
  });
}

/**
 * Handle workflow.step.completed event
 *
 * Updates step result, finds newly ready steps, checks if workflow is complete.
 */
export async function handleStepCompleted(
  env: Env,
  executionId: string,
  stepName: string,
  output: unknown,
  error: string | undefined,
): Promise<void> {
  console.log(
    `[ORCHESTRATOR] Step completed: ${executionId}/${stepName}`,
    error ? `(error: ${error})` : "(success)",
  );

  // Update step result
  await updateStepResult(env, executionId, stepName, {
    output,
    error,
    completed_at_epoch_ms: Date.now(),
  });

  // Get execution context in a single query (optimized)
  const context = await getExecutionContext(env, executionId);
  if (!context || context.execution.status !== "running") {
    console.log(
      `[ORCHESTRATOR] Execution ${executionId} is not running, skipping completion handling`,
    );
    return;
  }

  // If step failed, fail the workflow (atomic - only if still running)
  if (error) {
    const updated = await updateExecution(
      env,
      executionId,
      {
        status: "error",
        error: `Step "${stepName}" failed: ${error}`,
        completed_at_epoch_ms: Date.now(),
      },
      { onlyIfStatus: "running" },
    );

    if (updated) {
      console.log(
        `[ORCHESTRATOR] Workflow ${executionId} failed: step ${stepName} error`,
      );
    }
    return;
  }

  // Unpack context
  const { workflow, stepResults } = context;
  const steps = workflow.steps as Step[];

  // Build sets for completed and claimed steps
  const completedStepNames = new Set<string>();
  const claimedStepNames = new Set<string>();
  const stepOutputs = new Map<string, unknown>();

  for (const result of stepResults) {
    if (result.completed_at_epoch_ms) {
      completedStepNames.add(result.step_id);
      stepOutputs.set(result.step_id, result.output);
    } else {
      claimedStepNames.add(result.step_id);
    }
  }

  // Check if workflow is complete
  if (completedStepNames.size === steps.length) {
    const lastOutput = stepOutputs.get(stepName);

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
    return;
  }

  // Find newly ready steps
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

  // Get workflow input for ref resolution
  const workflowInput = workflow.input ?? {};

  // Dispatch step.execute events in parallel
  await Promise.all(
    readySteps.map((step) => {
      const { resolved } = resolveAllRefs(step.input, {
        workflowInput,
        stepOutputs,
      });

      return publishEvent(env, "workflow.step.execute", executionId, {
        stepName: step.name,
        input: resolved,
      });
    }),
  );
}
