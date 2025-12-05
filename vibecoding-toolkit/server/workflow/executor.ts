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
import type { RefContext } from "./ref-resolver.ts";
import type {
  ExecutorConfig,
  StepExecutionResult,
  TriggerResult,
  WorkflowExecutionResult,
} from "./types.ts";
import {
  canResolveAllRefs,
  resolveAllRefs,
  extractRefs,
  parseAtRef,
} from "./ref-resolver.ts";
import {
  checkIfCancelled,
  createStepResult,
  getStepResult,
  getStepResults,
  updateExecution,
  updateStepResult,
} from "../lib/execution-db.ts";
import { lockWorkflowExecution, releaseLock } from "./lock.ts";
import {
  DurableSleepError,
  WaitingForSignalError,
  WorkflowCancelledError,
} from "./errors.ts";
import type { Step, Trigger } from "@decocms/bindings/workflow";
import { StepExecutor } from "./step-executor.ts";
import { getWorkflow } from "server/tools/workflow.ts";
import {
  hasForEach,
  hasParallelGroup,
  resolveForEachItems,
  executeWithMode,
  createIterationContext,
  parseStepConfig,
  type ParallelMode,
} from "./control-flow.ts";

// Re-export for backwards compatibility
export type { ExecutorConfig, StepExecutionResult, WorkflowExecutionResult };
export { WaitingForSignalError };

const DEFAULT_LOCK_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Analyze step dependencies from @refs and group steps into parallel execution levels.
 * Steps with no dependencies on other steps run first (level 0).
 * Steps that depend on level N steps run at level N+1.
 * Steps at the same level can run in parallel.
 */
function groupStepsByDependencies(steps: Step[], verbose: boolean): Step[][] {
  if (steps.length === 0) return [];

  // Build a map of step name -> step
  const stepMap = new Map<string, Step>();
  for (const step of steps) {
    stepMap.set(step.name, step);
  }

  // For each step, find which other steps it depends on
  const dependencies = new Map<string, Set<string>>();
  for (const step of steps) {
    const deps = new Set<string>();
    const refs = extractRefs(step.input || {});

    for (const ref of refs) {
      if (!ref.startsWith("@")) continue;
      const parsed = parseAtRef(ref as `@${string}`);

      // Only track step dependencies (not @input, @output, etc.)
      if (
        parsed.type === "step" &&
        parsed.stepName &&
        stepMap.has(parsed.stepName)
      ) {
        deps.add(parsed.stepName);
      }
    }

    dependencies.set(step.name, deps);
  }

  // Topological sort with level tracking
  const levels: Step[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < steps.length) {
    // Find all steps whose dependencies are satisfied
    const currentLevel: Step[] = [];

    for (const step of steps) {
      if (assigned.has(step.name)) continue;

      const deps = dependencies.get(step.name) || new Set();
      const allDepsSatisfied = [...deps].every((dep) => assigned.has(dep));

      if (allDepsSatisfied) {
        currentLevel.push(step);
      }
    }

    if (currentLevel.length === 0) {
      // Circular dependency detected - fall back to sequential execution
      console.warn(
        "[WORKFLOW] Circular dependency detected, falling back to sequential execution",
      );
      const remaining = steps.filter((s) => !assigned.has(s.name));
      for (const step of remaining) {
        levels.push([step]);
        assigned.add(step.name);
      }
      break;
    }

    // Add this level
    levels.push(currentLevel);
    for (const step of currentLevel) {
      assigned.add(step.name);
    }
  }

  if (verbose) {
    console.log(
      `[WORKFLOW] Dependency analysis: ${levels.length} execution levels`,
    );
    levels.forEach((level, i) => {
      const stepNames = level.map((s) => s.name).join(", ");
      console.log(
        `  Level ${i}: [${stepNames}]${level.length > 1 ? " (parallel)" : ""}`,
      );
    });
  }

  return levels;
}

async function executeStepWithCheckpoint(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<StepExecutionResult> {
  const existing = await getStepResult(env, executionId, step.name);
  console.log(
    "🚀 ~ executeStepWithCheckpoint ~ existing:",
    JSON.stringify(existing, null, 2),
  );
  if (existing && !!existing.completed_at_epoch_ms && !!existing.output) {
    if (verbose) console.log(`[${step.name}] Replaying cached output`);
    return {
      output: existing.output,
      startedAt: new Date(existing.created_at).getTime() || Date.now(),
      completedAt: existing.completed_at_epoch_ms ?? undefined,
    };
  }

  // Create or get step record
  let stepRecord = existing;
  if (!stepRecord) {
    const { result, created } = await createStepResult(env, {
      execution_id: executionId,
      step_id: step.name,
      started_at_epoch_ms: Date.now(),
    });
    stepRecord = result;

    if (!created) {
      // Handle race condition - another worker created the record
      if (!!result.completed_at_epoch_ms && !!result.output) {
        return {
          output: result.output,
          startedAt: new Date(result.created_at).getTime() || Date.now(),
          completedAt: result.completed_at_epoch_ms ?? undefined,
        };
      }
      if (!!result.completed_at_epoch_ms && !!result.error) {
        return {
          error: result.error || "Step failed on another worker",
          startedAt: new Date(result.created_at).getTime() || Date.now(),
          completedAt: result.completed_at_epoch_ms ?? undefined,
        };
      }
      // Allow waitForSignal steps to be picked up by multiple workers
      if ("signalName" in step.action && step.action.signalName) {
        throw new Error(
          `CONTENTION: Step ${step.name} is being executed by another worker`,
        );
      }
    }
  }

  // Execute the step
  try {
    // Use stepRecord.input if saved, otherwise fall back to step definition
    const input = (stepRecord.input ?? step.input ?? {}) as Record<
      string,
      unknown
    >;
    const { resolved: resolvedInput, errors } = resolveAllRefs(input, ctx);

    if (errors) {
      const errorMsg = errors.map((e) => e.error).join(", ");
      throw new Error(
        `Failed to resolve input for step ${step.name}: ${errorMsg}`,
      );
    }

    const stepExecutor = new StepExecutor(env);
    const result = await stepExecutor.executeStep(
      step,
      resolvedInput as Record<string, unknown>,
      ctx,
      executionId,
      stepRecord,
    );

    await updateStepResult(env, executionId, step.name, {
      output: result.output,
      error: result.error,
      completed_at_epoch_ms: result.completedAt,
    });

    return result;
  } catch (err) {
    if (err instanceof WaitingForSignalError) {
      if (verbose) {
        console.log(`[${step.name}] Waiting for signal '${err.signalName}'`);
      }
      throw err;
    }
    throw err;
  }
}

// =============================================================================
// ForEach Execution
// =============================================================================

/**
 * Execute a step with forEach config, running iterations according to the mode
 */
async function executeForEachStep(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<StepExecutionResult> {
  const forEachData = resolveForEachItems(step, ctx);
  if (!forEachData) {
    throw new Error(`Failed to resolve forEach items for step ${step.name}`);
  }

  const { items, config } = forEachData;
  const mode = config.mode || "sequential";

  if (verbose) {
    console.log(`[${step.name}] forEach: ${items.length} items, mode: ${mode}`);
  }

  // Execute each iteration
  const forEachResult = await executeWithMode(
    items.map((item, index) => ({ item, index })),
    async (item, index) => {
      // Create iteration context with @item and @index
      const iterCtx = createIterationContext(ctx, item, index);

      // Create a virtual step for this iteration
      const iterStep: Step = {
        ...step,
        name: `${step.name}[${index}]`,
      };

      // Execute the step with iteration context
      const result = await executeStepWithCheckpoint(
        env,
        iterStep,
        iterCtx,
        executionId,
        verbose,
      );

      return result;
    },
    mode,
    config.maxConcurrency,
  );

  // Aggregate results based on mode
  if (mode === "race" && forEachResult.winner !== undefined) {
    // For race, return the winning result
    const winnerResult = forEachResult.results.find(
      (r) => r.index === forEachResult.winner,
    );
    return {
      output: {
        mode: "race",
        winner: forEachResult.winner,
        item: winnerResult?.item,
        value: winnerResult?.value?.output,
      },
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
  }

  // For other modes, return all results
  const outputs = forEachResult.results.map((r) => ({
    index: r.index,
    item: r.item,
    status: r.status,
    output: r.status === "fulfilled" ? r.value?.output : undefined,
    error: r.status === "rejected" ? r.reason : undefined,
  }));

  const hasFailures = outputs.some((o) => o.status === "rejected");

  return {
    output: {
      mode,
      count: items.length,
      results: outputs,
      fulfilled: outputs.filter((o) => o.status === "fulfilled").length,
      rejected: outputs.filter((o) => o.status === "rejected").length,
    },
    error:
      hasFailures && mode !== "allSettled"
        ? `${outputs.filter((o) => o.status === "rejected").length} iterations failed`
        : undefined,
    startedAt: Date.now(),
    completedAt: Date.now(),
  };
}

// =============================================================================
// Phase Execution
// =============================================================================

async function executePhase(
  env: Env,
  phase: Step[],
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<Record<string, StepExecutionResult>> {
  // Execute a single step, routing to forEach handler when needed
  const executeStep = (step: Step) => {
    if (hasForEach(step)) {
      return executeForEachStep(env, step, ctx, executionId, verbose);
    }
    return executeStepWithCheckpoint(env, step, ctx, executionId, verbose);
  };

  // Group steps by parallel config
  const regularSteps: Step[] = [];
  const parallelGroups = new Map<
    string,
    { steps: Step[]; mode: ParallelMode }
  >();

  for (const step of phase) {
    if (hasParallelGroup(step)) {
      const config = parseStepConfig(step)!;
      const groupId = config.parallel!.group;
      const mode = config.parallel!.mode || "all";

      if (!parallelGroups.has(groupId)) {
        parallelGroups.set(groupId, { steps: [], mode });
      }
      parallelGroups.get(groupId)!.steps.push(step);
    } else {
      regularSteps.push(step);
    }
  }

  const stepResults: Record<string, StepExecutionResult> = {};

  // Execute regular steps with Promise.all (default behavior)
  if (regularSteps.length > 0) {
    const results = await Promise.allSettled(regularSteps.map(executeStep));
    processStepResults(regularSteps, results, stepResults, env, executionId);
  }

  // Execute parallel groups with their specified mode
  for (const [groupId, { steps, mode }] of parallelGroups) {
    if (verbose) {
      console.log(
        `[WORKFLOW] Executing parallel group '${groupId}' with mode: ${mode}`,
      );
    }

    const groupResult = await executeParallelGroup(
      steps,
      executeStep,
      mode,
      groupId,
    );

    // Store group result under a special key for the group
    stepResults[`@group:${groupId}`] = groupResult.groupResult;

    // Also store individual step results
    for (const [stepName, result] of Object.entries(groupResult.stepResults)) {
      stepResults[stepName] = result;
    }
  }

  return stepResults;
}

/**
 * Execute a parallel group with the specified mode (all, race, allSettled)
 */
async function executeParallelGroup(
  steps: Step[],
  executeStep: (step: Step) => Promise<StepExecutionResult>,
  mode: ParallelMode,
  _groupId: string,
): Promise<{
  groupResult: StepExecutionResult;
  stepResults: Record<string, StepExecutionResult>;
}> {
  const stepResults: Record<string, StepExecutionResult> = {};

  switch (mode) {
    case "race": {
      // First to complete wins
      const racePromises = steps.map(async (step) => {
        const result = await executeStep(step);
        return { step, result };
      });

      const winner = await Promise.race(racePromises);
      stepResults[winner.step.name] = winner.result;

      return {
        groupResult: {
          output: {
            mode: "race",
            winner: winner.step.name,
            value: winner.result.output,
          },
          startedAt: Date.now(),
          completedAt: Date.now(),
        },
        stepResults,
      };
    }

    case "allSettled": {
      // Wait for all, collect successes and failures
      const results = await Promise.allSettled(steps.map(executeStep));

      const settled: Array<{
        step: string;
        status: "fulfilled" | "rejected";
        value?: unknown;
        reason?: string;
      }> = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const result = results[i];

        if (result.status === "fulfilled") {
          stepResults[step.name] = result.value;
          settled.push({
            step: step.name,
            status: "fulfilled",
            value: result.value.output,
          });
        } else {
          const error = result.reason?.message || String(result.reason);
          stepResults[step.name] = {
            error,
            startedAt: Date.now(),
            completedAt: Date.now(),
          };
          settled.push({
            step: step.name,
            status: "rejected",
            reason: error,
          });
        }
      }

      return {
        groupResult: {
          output: {
            mode: "allSettled",
            results: settled,
            fulfilled: settled.filter((s) => s.status === "fulfilled").length,
            rejected: settled.filter((s) => s.status === "rejected").length,
          },
          startedAt: Date.now(),
          completedAt: Date.now(),
        },
        stepResults,
      };
    }

    case "all":
    default: {
      // Default Promise.all behavior - fail fast
      const results = await Promise.allSettled(steps.map(executeStep));

      let hasError = false;
      let firstError: string | undefined;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const result = results[i];

        if (result.status === "fulfilled") {
          stepResults[step.name] = result.value;
        } else {
          const error = result.reason?.message || String(result.reason);
          stepResults[step.name] = {
            error,
            startedAt: Date.now(),
            completedAt: Date.now(),
          };
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
      }

      return {
        groupResult: {
          output: Object.fromEntries(
            Object.entries(stepResults)
              .filter(([, r]) => !r.error)
              .map(([name, r]) => [name, r.output]),
          ),
          error: firstError,
          startedAt: Date.now(),
          completedAt: Date.now(),
        },
        stepResults,
      };
    }
  }
}

/**
 * Process step results and update the database
 */
async function processStepResults(
  steps: Step[],
  results: PromiseSettledResult<StepExecutionResult>[],
  stepResults: Record<string, StepExecutionResult>,
  env: Env,
  executionId: string,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      stepResults[step.name] = result.value;
      continue;
    }

    // Re-throw control flow errors (these are handled specially by the executor)
    if (
      result.reason instanceof WorkflowCancelledError ||
      result.reason instanceof WaitingForSignalError ||
      result.reason instanceof DurableSleepError
    ) {
      throw result.reason;
    }

    // Record step failure
    const error = result.reason?.message || String(result.reason);
    stepResults[step.name] = {
      error,
      startedAt: Date.now(),
      completedAt: Date.now(),
    };

    try {
      await updateStepResult(env, executionId, step.name, {
        error,
        completed_at_epoch_ms: Date.now(),
      });
    } catch (err) {
      console.error(`[${step.name}] Failed to update step result: ${err}`);
    }
  }
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

export async function executeWorkflow(
  env: Env,
  executionId: string,
  config: ExecutorConfig = {},
): Promise<WorkflowExecutionResult> {
  const { lockDurationMs = DEFAULT_LOCK_MS, verbose = true } = config;
  let lockId: string | undefined;
  const startTime = Date.now();

  try {
    // Acquire lock
    const { lockedExecution } = await lockWorkflowExecution(env, executionId, {
      durationMs: lockDurationMs,
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

    // Handle both legacy { phases: [...] } format and new flat array format
    let steps: Step[];
    if (Array.isArray(parsedSteps)) {
      // New format: flat array of steps
      steps = parsedSteps;
    } else if (parsedSteps.phases) {
      // Legacy format: flatten phases into sequential steps
      steps = parsedSteps.phases.flat();
    } else {
      steps = [];
    }

    // Automatically group steps into parallel execution levels based on @ref dependencies
    const phases: Step[][] = groupStepsByDependencies(steps, verbose);
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

    // Execute phases sequentially
    for (let pi = 0; pi < phases.length; pi++) {
      if (verbose) {
        console.log(`[WORKFLOW] Phase ${pi} (${phases[pi].length} steps)`);
      }

      await checkIfCancelled(env, executionId);

      const stepResults = await executePhase(
        env,
        phases[pi],
        ctx,
        executionId,
        verbose,
      );

      // Check for failures
      const failures = Object.entries(stepResults).filter(([, r]) => !!r.error);

      if (failures.length) {
        const errorMsg = failures
          .map(([n, r]) => `${n}: ${r.error}`)
          .join("; ");
        await updateExecution(env, executionId, {
          status: "completed",
          error: errorMsg,
          completed_at_epoch_ms: Date.now(),
        });
        return {
          status: "failed",
          error: errorMsg,
          retryable: false,
        };
      }

      // Update context with new outputs
      for (const [name, result] of Object.entries(stepResults)) {
        if (result.output !== undefined) {
          // Always add to stepOutputs for @ref resolution
          stepOutputs.set(name, result.output);
          completedSteps.push(name);

          // Only use as workflow output if not marked as excluded (large/streaming)
          if (!result.excludeFromWorkflowOutput) {
            lastOutput = result.output;
          }
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
    await updateExecution(env, lockedExecution.id, {
      status: "completed",
      output: workflowOutput,
      completed_at_epoch_ms: Date.now(),
      retry_count: 0,
    });

    if (verbose) {
      console.log(
        `[WORKFLOW] ${executionId} completed in ${Date.now() - startTime}ms`,
      );
    }

    return { status: "completed", output: workflowOutput, triggerResults };
  } catch (err) {
    return handleExecutorError(env, executionId, err);
  } finally {
    if (lockId) await releaseLock(env, executionId, lockId);
  }
}

async function handleExecutorError(
  env: Env,
  executionId: string,
  err: unknown,
): Promise<WorkflowExecutionResult> {
  // Handle workflow cancellation
  if (err instanceof WorkflowCancelledError) {
    console.log(`[WORKFLOW] ${executionId} cancelled`);
    return { status: "cancelled" };
  }

  // Handle waiting for signal - don't mark as error, just pause
  if (err instanceof WaitingForSignalError) {
    console.log(
      `[WORKFLOW] ${executionId} waiting for signal '${err.signalName}'`,
    );
    return {
      status: "waiting_for_signal",
      signalName: err.signalName,
      stepName: err.stepName,
      timeoutAtEpochMs: err.timeoutMs
        ? err.waitStartedAt + err.timeoutMs
        : undefined,
    };
  }

  // Handle durable sleep - timer event already scheduled by executeSleepStep
  if (err instanceof DurableSleepError) {
    console.log(
      `[WORKFLOW] ${executionId} sleeping until ${new Date(err.wakeAtEpochMs).toISOString()}`,
    );
    // Timer event is already scheduled - no need to store in step output
    return {
      status: "sleeping",
      wakeAtEpochMs: err.wakeAtEpochMs,
      stepName: err.stepName,
    };
  }

  // Unexpected error - mark as failed
  const errorMsg = err instanceof Error ? err.message : String(err);
  console.error(`[WORKFLOW] ${executionId} failed:`, err);

  await updateExecution(env, executionId, {
    status: "completed",
    completed_at_epoch_ms: Date.now(),
    error: errorMsg,
  });

  return {
    status: "failed",
    error: errorMsg,
    retryable: true,
    retryDelaySeconds: 60,
  };
}
