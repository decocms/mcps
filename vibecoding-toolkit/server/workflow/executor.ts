/**
 * Phase-Based Workflow Executor
 *
 * Executes workflows with:
 * - Phase-based parallelism (phases sequential, steps within phases parallel)
 * - Tool step execution via MCP
 * - Transform step execution in QuickJS sandbox
 * - Sleep step execution
 * - ForEach loop modifier
 * - Trigger firing on completion
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import type { Env } from "../main.ts";
import {
  type Step,
  type Workflow,
  type Trigger,
  getStepType,
} from "./schema.ts";
import {
  type RefContext,
  resolveAllRefs,
  canResolveAllRefs,
  isAtRef,
  resolveRef,
} from "./ref-resolver.ts";
import { executeTransform } from "./transform-executor.ts";
import {
  getExecution,
  updateExecution,
  createStepResult,
  updateStepResult,
  getStepResult,
  getStepResults,
} from "../lib/execution-db.ts";
import { acquireLock, releaseLock } from "../lib/workflow-lock.ts";
import type { QueueMessage } from "../collections/workflow.ts";

/**
 * Error thrown when a step needs to be re-scheduled (e.g., for long sleeps)
 */
export class DurableSleepError extends Error {
  constructor(public remainingMs: number) {
    super(`Durable sleep needs re-scheduling: ${remainingMs}ms remaining`);
    this.name = "DurableSleepError";
  }
}

// ============================================================================
// Types
// ============================================================================

export interface StepExecutionResult {
  status: "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  iterations?: Array<{
    index: number;
    item: unknown;
    output?: unknown;
    error?: string;
  }>;
  startedAt: number;
  completedAt?: number;
}

export interface PhaseExecutionResult {
  phaseIndex: number;
  steps: Record<string, StepExecutionResult>;
  startedAt: number;
  completedAt?: number;
}

export interface WorkflowExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  shouldRetry?: boolean;
  retryDelaySeconds?: number;
  triggerResults?: Array<{
    triggerId: string;
    status: "triggered" | "skipped" | "failed";
    executionIds?: string[];
    error?: string;
  }>;
}

export interface ExecutorConfig {
  stepTimeoutMs?: number;
  lockDurationMs?: number;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<ExecutorConfig> = {
  stepTimeoutMs: 5 * 60 * 1000, // 5 minutes
  lockDurationMs: 5 * 60 * 1000, // 5 minutes
  verbose: true,
};

// ============================================================================
// Step Executors
// ============================================================================

/**
 * Execute a tool step via MCP
 */
async function executeToolStep(
  env: Env,
  step: Step,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (!step.tool) throw new Error("Tool step missing tool configuration");

  const connection = createProxyConnection(step.tool.connectionId, {
    workspace: env.DECO_WORKSPACE,
    token: env.DECO_REQUEST_CONTEXT.token,
  });

  const result = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
    connection: connection as any,
    params: {
      name: step.tool.toolName,
      arguments: input,
    },
  });

  return result;
}

/**
 * Execute a sleep step
 */
async function executeSleepStep(step: Step, ctx: RefContext): Promise<void> {
  if (!step.sleep) throw new Error("Sleep step missing sleep configuration");

  let sleepMs = step.sleep.ms || 0;

  // Handle 'until' with @ref resolution
  if (step.sleep.until) {
    let until: Date;
    if (isAtRef(step.sleep.until as `@${string}`)) {
      const { value } = resolveRef(step.sleep.until as `@${string}`, ctx);
      until = new Date(value as string);
    } else {
      until = new Date(step.sleep.until);
    }

    const now = Date.now();
    sleepMs = Math.max(0, until.getTime() - now);
  }

  if (sleepMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}

/**
 * Execute a single step (any type) with resolved input
 */
async function executeSingleStep(
  env: Env,
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: RefContext,
): Promise<{ output: unknown; error?: string }> {
  const stepType = getStepType(step);

  switch (stepType) {
    case "tool": {
      const output = await executeToolStep(env, step, resolvedInput);
      return { output };
    }

    case "transform": {
      const result = await executeTransform(
        step.transform!,
        resolvedInput,
        step.name,
      );
      if (!result.success) {
        return { output: undefined, error: result.error };
      }
      return { output: result.output };
    }

    case "sleep": {
      await executeSleepStep(step, ctx);
      return { output: { slept: true } };
    }

    default:
      return {
        output: undefined,
        error: `Unknown step type for step: ${step.name}`,
      };
  }
}

/**
 * Execute a step with forEach support
 */
async function executeStepWithForEach(
  env: Env,
  step: Step,
  ctx: RefContext,
): Promise<StepExecutionResult> {
  const startedAt = Date.now();

  try {
    // Resolve base input first (without @item/@index)
    const { resolved: baseInput, errors: baseErrors } = resolveAllRefs(
      step.input || {},
      ctx,
    );

    if (baseErrors?.length) {
      console.warn(`[STEP ${step.name}] Ref resolution warnings:`, baseErrors);
    }

    // If no forEach, execute once
    if (!step.forEach) {
      const { output, error } = await executeSingleStep(
        env,
        step,
        baseInput as Record<string, unknown>,
        ctx,
      );

      if (error) {
        return {
          status: "failed",
          error,
          startedAt,
          completedAt: Date.now(),
        };
      }

      return {
        status: "completed",
        output,
        startedAt,
        completedAt: Date.now(),
      };
    }

    // ForEach loop
    const { value: arrayValue, error: arrayError } = resolveRef(
      step.forEach as `@${string}`,
      ctx,
    );

    if (arrayError || !Array.isArray(arrayValue)) {
      return {
        status: "failed",
        error:
          arrayError || `forEach ref must resolve to an array: ${step.forEach}`,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const maxIterations = step.maxIterations || 100;
    const iterations: StepExecutionResult["iterations"] = [];
    const outputs: unknown[] = [];

    // Cache array length to prevent issues if array mutates (shouldn't happen, but safety first)
    const arrayLength = arrayValue.length;
    const iterationCount = Math.min(arrayLength, maxIterations);

    for (let i = 0; i < iterationCount; i++) {
      const item = arrayValue[i];

      // Create iteration context
      const iterCtx: RefContext = {
        ...ctx,
        item,
        index: i,
      };

      // Resolve input with @item and @index available
      const { resolved: iterInput, errors: iterErrors } = resolveAllRefs(
        step.input || {},
        iterCtx,
      );

      if (iterErrors?.length) {
        console.warn(
          `[STEP ${step.name}] Iteration ${i} ref warnings:`,
          iterErrors,
        );
      }

      try {
        const { output, error } = await executeSingleStep(
          env,
          step,
          iterInput as Record<string, unknown>,
          iterCtx,
        );

        iterations.push({
          index: i,
          item,
          output,
          error,
        });

        if (!error) {
          outputs.push(output);
        }
      } catch (error) {
        iterations.push({
          index: i,
          item,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Output is array of all iteration outputs
    return {
      status: "completed",
      output: outputs,
      iterations,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt: Date.now(),
    };
  }
}

// ============================================================================
// Phase Execution
// ============================================================================

/**
 * Check if a step has already been executed and return cached result.
 * This is the key DBOS pattern for deterministic replay.
 */
async function getCheckpointedStepResult(
  env: Env,
  executionId: string,
  stepName: string,
  verbose: boolean = false,
): Promise<StepExecutionResult | null> {
  const existing = await getStepResult(env, executionId, stepName);

  if (existing?.status === "completed" && existing.output !== undefined) {
    if (verbose) {
      console.log(
        `[STEP ${stepName}] Replaying cached output (deterministic replay)`,
      );
    }
    return {
      status: "completed",
      output: existing.output,
      startedAt: existing.started_at_epoch_ms || Date.now(),
      completedAt: existing.completed_at_epoch_ms ?? undefined,
    };
  }

  return null;
}

/**
 * Execute a step with checkpointing and contention handling.
 *
 * Uses UNIQUE constraint to detect duplicate execution:
 * - If we win the race (created step record) → execute the step
 * - If we lose the race (conflict) → use existing result, DON'T execute
 *
 * @see https://www.dbos.dev/blog/scaleable-decentralized-workflows
 */
async function executeStepWithCheckpoint(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  phaseIndex: number,
  verbose: boolean = false,
): Promise<StepExecutionResult> {
  // 1. Check for cached result (DBOS pattern: deterministic replay)
  const cached = await getCheckpointedStepResult(
    env,
    executionId,
    step.name,
    verbose,
  );
  if (cached) {
    return cached;
  }

  // 2. Try to create step record - this detects contention
  const { result: stepRecord, created } = await createStepResult(env, {
    execution_id: executionId,
    step_id: step.name,
    step_index: phaseIndex,
    status: "running",
    started_at_epoch_ms: Date.now(),
  });

  // 3. If we lost the race, another worker is handling this step
  if (!created) {
    if (verbose) {
      console.log(`[STEP ${step.name}] Lost race, another worker is executing`);
    }

    // If already completed, use that result
    if (stepRecord.status === "completed" && stepRecord.output !== undefined) {
      return {
        status: "completed",
        output: stepRecord.output,
        startedAt: stepRecord.started_at_epoch_ms || Date.now(),
        completedAt: stepRecord.completed_at_epoch_ms ?? undefined,
      };
    }

    // If failed, propagate the failure
    if (stepRecord.status === "failed") {
      return {
        status: "failed",
        error: stepRecord.error || "Step failed on another worker",
        startedAt: stepRecord.started_at_epoch_ms || Date.now(),
        completedAt: stepRecord.completed_at_epoch_ms ?? undefined,
      };
    }

    // Still running on another worker - throw to trigger retry later
    throw new Error(
      `CONTENTION: Step ${step.name} is being executed by another worker`,
    );
  }

  // 4. We won the race - execute the step
  const result = await executeStepWithForEach(env, step, ctx);

  // 5. Persist result (only if not already completed by another worker)
  await updateStepResult(env, executionId, step.name, {
    status: result.status === "completed" ? "completed" : "failed",
    output: result.output, // Can be object or array (forEach steps)
    error: result.error,
    completed_at_epoch_ms: result.completedAt,
  });

  return result;
}

/**
 * Execute a phase (all steps in parallel) with step-level checkpointing.
 * Steps that were already completed will be replayed from cache.
 */
async function executePhase(
  env: Env,
  phase: Step[],
  phaseIndex: number,
  ctx: RefContext,
  executionId: string,
  verbose: boolean = false,
): Promise<PhaseExecutionResult> {
  const startedAt = Date.now();
  const stepResults: Record<string, StepExecutionResult> = {};

  // Execute all steps in parallel with checkpointing
  const results = await Promise.allSettled(
    phase.map((step) =>
      executeStepWithCheckpoint(
        env,
        step,
        ctx,
        executionId,
        phaseIndex,
        verbose,
      ),
    ),
  );

  // Process results
  for (let i = 0; i < phase.length; i++) {
    const step = phase[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      stepResults[step.name] = result.value;
    } else {
      stepResults[step.name] = {
        status: "failed",
        error: result.reason?.message || String(result.reason),
        startedAt,
        completedAt: Date.now(),
      };

      // Persist error (best effort - might not exist if createStepResult failed)
      try {
        await updateStepResult(env, executionId, step.name, {
          status: "failed",
          error: result.reason?.message || String(result.reason),
          completed_at_epoch_ms: Date.now(),
        });
      } catch (updateErr) {
        console.warn(`[STEP ${step.name}] Could not persist error:`, updateErr);
      }
    }
  }

  return {
    phaseIndex,
    steps: stepResults,
    startedAt,
    completedAt: Date.now(),
  };
}

// ============================================================================
// Trigger Execution
// ============================================================================

/**
 * Fire triggers after workflow completion
 */
async function fireTriggers(
  env: Env,
  triggers: Trigger[],
  ctx: RefContext,
  parentExecutionId: string,
): Promise<WorkflowExecutionResult["triggerResults"]> {
  const results: WorkflowExecutionResult["triggerResults"] = [];

  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    const triggerId = `trigger-${i}`;

    try {
      // Check if trigger can resolve (conditional firing)
      // Skip this check for forEach triggers since @item/@index won't be available yet
      if (!trigger.forEach && !canResolveAllRefs(trigger.inputs, ctx)) {
        results.push({
          triggerId,
          status: "skipped",
        });
        continue;
      }

      // Handle forEach on trigger
      if (trigger.forEach) {
        const { value: arrayValue, error } = resolveRef(
          trigger.forEach as `@${string}`,
          ctx,
        );

        if (error || !Array.isArray(arrayValue)) {
          results.push({
            triggerId,
            status: "failed",
            error: error || "forEach must resolve to array",
          });
          continue;
        }

        const executionIds: string[] = [];

        // Safety check: empty array
        if (arrayValue.length === 0) {
          results.push({
            triggerId,
            status: "triggered",
            executionIds: [],
          });
          continue;
        }

        // Safety limit to prevent DoS (creating thousands of workflows)
        const MAX_TRIGGER_ITERATIONS = 100;
        if (arrayValue.length > MAX_TRIGGER_ITERATIONS) {
          results.push({
            triggerId,
            status: "failed",
            error: `forEach array too large: ${arrayValue.length} items (max ${MAX_TRIGGER_ITERATIONS})`,
          });
          continue;
        }

        for (let j = 0; j < arrayValue.length; j++) {
          const item = arrayValue[j];

          const triggerCtx: RefContext = {
            ...ctx,
            item,
            index: j,
          };

          const { resolved: inputs } = resolveAllRefs(
            trigger.inputs,
            triggerCtx,
          );

          // Create and queue execution
          const message: QueueMessage = {
            executionId: crypto.randomUUID(),
            retryCount: 0,
            enqueuedAt: Date.now(),
            authorization: env.DECO_REQUEST_CONTEXT.token,
          };

          // Create execution record first (with parent tracking)
          await env.DATABASE.DATABASES_RUN_SQL({
            sql: `
              INSERT INTO workflow_executions (
                id, workflow_id, status, created_at, updated_at, inputs,
                workflow_timeout_ms, max_retries, parent_execution_id
              ) VALUES ($1, $2, 'pending', $3, $3, $4, $5, $6, $7)
            `,
            params: [
              message.executionId,
              trigger.workflowId,
              new Date().toISOString(),
              JSON.stringify(inputs),
              trigger.workflow_timeout_ms || null,
              trigger.max_retries || 10,
              parentExecutionId,
            ],
          });

          await env.WORKFLOW_QUEUE.send(message);
          executionIds.push(message.executionId);
        }

        results.push({
          triggerId,
          status: "triggered",
          executionIds,
        });
      } else {
        // Single trigger
        const { resolved: inputs } = resolveAllRefs(trigger.inputs, ctx);

        const message: QueueMessage = {
          executionId: crypto.randomUUID(),
          retryCount: 0,
          enqueuedAt: Date.now(),
          authorization: env.DECO_REQUEST_CONTEXT.token,
        };

        // Create execution record (with parent tracking)
        await env.DATABASE.DATABASES_RUN_SQL({
          sql: `
            INSERT INTO workflow_executions (
              id, workflow_id, status, created_at, updated_at, inputs,
              workflow_timeout_ms, max_retries, parent_execution_id
            ) VALUES ($1, $2, 'pending', $3, $3, $4, $5, $6, $7)
          `,
          params: [
            message.executionId,
            trigger.workflowId,
            new Date().toISOString(),
            JSON.stringify(inputs),
            trigger.workflow_timeout_ms || null,
            trigger.max_retries || 10,
            parentExecutionId,
          ],
        });

        await env.WORKFLOW_QUEUE.send(message);

        results.push({
          triggerId,
          status: "triggered",
          executionIds: [message.executionId],
        });
      }
    } catch (error) {
      results.push({
        triggerId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a workflow with durable guarantees
 */
export async function executeWorkflow(
  env: Env,
  executionId: string,
  retryCount: number = 0,
  config: ExecutorConfig = {},
): Promise<WorkflowExecutionResult> {
  const {
    lockDurationMs = DEFAULT_CONFIG.lockDurationMs,
    verbose = DEFAULT_CONFIG.verbose,
  } = config;

  let lockId: string | undefined;
  const startTime = Date.now();

  try {
    // 1. Check execution status FIRST (before lock) to prevent retry loops
    // This is critical for safety guard pattern - completed executions should
    // return success immediately so no new safety guards are scheduled.
    const preCheckExecution = await getExecution(env, executionId);
    if (!preCheckExecution) {
      // Execution doesn't exist - don't retry
      return {
        success: false,
        error: `Execution ${executionId} not found`,
        shouldRetry: false,
      };
    }

    if (!["pending", "running"].includes(preCheckExecution.status)) {
      if (verbose) {
        console.log(
          `[WORKFLOW] Execution ${executionId} is already ${preCheckExecution.status}, skipping`,
        );
      }
      // Return success for completed/failed/cancelled - no retry needed
      return { success: true, output: preCheckExecution.output };
    }

    // 2. Acquire lock (only for pending/running executions)
    const lock = await acquireLock(env, executionId, {
      durationMs: lockDurationMs,
    });
    if (!lock.acquired || !lock.lockId) {
      return {
        success: false,
        error: "LOCKED: Execution is being processed by another worker",
        shouldRetry: true,
        retryDelaySeconds: 30,
      };
    }
    lockId = lock.lockId;

    // 3. Re-check execution status after acquiring lock (might have changed)
    const execution = await getExecution(env, executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!["pending", "running"].includes(execution.status)) {
      if (verbose) {
        console.log(
          `[WORKFLOW] Execution ${executionId} is ${execution.status}, skipping`,
        );
      }
      return { success: true, output: execution.output };
    }

    // 3. Load workflow
    const { item: workflow } = await env.SELF.DECO_COLLECTION_WORKFLOWS_GET({
      id: execution.workflow_id,
    });

    if (!workflow) {
      throw new Error(`Workflow ${execution.workflow_id} not found`);
    }

    // Parse steps - expect 2D array format or convert from old format
    let parsedSteps = workflow.steps
      ? typeof workflow.steps === "string"
        ? JSON.parse(workflow.steps)
        : workflow.steps
      : { phases: [], triggers: [] };

    // Handle stored format with phases/triggers wrapper
    // Capture triggers BEFORE overwriting parsedSteps with phases
    const storedTriggers = parsedSteps.triggers;
    if (verbose) {
      console.log(`[WORKFLOW] Stored triggers found:`, storedTriggers);
    }
    if (parsedSteps.phases) {
      parsedSteps = parsedSteps.phases;
    }

    const workflowData: Workflow = {
      name: workflow.name,
      description: workflow.description,
      steps: parsedSteps,
      triggers: (workflow as any).triggers || storedTriggers,
    };
    if (verbose) {
      console.log(`[WORKFLOW] Final triggers:`, workflowData.triggers);
    }

    // Convert flat array to 2D if needed (backwards compatibility)
    if (
      workflowData.steps.length > 0 &&
      !Array.isArray(workflowData.steps[0])
    ) {
      workflowData.steps = (workflowData.steps as unknown as Step[]).map(
        (step) => [step],
      );
    }

    // 4. Parse inputs
    const workflowInput =
      typeof execution.inputs === "string"
        ? JSON.parse(execution.inputs)
        : execution.inputs || {};

    // 5. Update status
    if (execution.status === "pending") {
      await updateExecution(env, executionId, {
        status: "running",
        started_at_epoch_ms: startTime,
      });
    }

    // 6. Build initial context and load any existing step outputs (for crash recovery)
    const stepOutputs = new Map<string, unknown>();

    // Load existing step results for crash recovery (deterministic replay)
    const existingStepResults = await getStepResults(env, executionId);
    for (const stepResult of existingStepResults) {
      if (
        stepResult.status === "completed" &&
        stepResult.output !== undefined
      ) {
        stepOutputs.set(stepResult.step_id, stepResult.output);
        if (verbose) {
          console.log(
            `[WORKFLOW] Loaded cached output for step: ${stepResult.step_id}`,
          );
        }
      }
    }

    const ctx: RefContext = {
      stepOutputs,
      workflowInput,
    };

    // 7. Execute phases sequentially
    let lastOutput: unknown;

    for (
      let phaseIndex = 0;
      phaseIndex < workflowData.steps.length;
      phaseIndex++
    ) {
      const phase = workflowData.steps[phaseIndex];

      if (verbose) {
        console.log(
          `[WORKFLOW] Executing phase ${phaseIndex} with ${phase.length} steps`,
        );
      }

      const phaseResult = await executePhase(
        env,
        phase,
        phaseIndex,
        ctx,
        executionId,
        verbose,
      );

      // Check for failures
      const failures = Object.entries(phaseResult.steps).filter(
        ([, result]) => result.status === "failed",
      );

      if (failures.length > 0) {
        const errorMessages = failures
          .map(([name, result]) => `${name}: ${result.error}`)
          .join("; ");

        await updateExecution(env, executionId, {
          status: "failed",
          error: errorMessages,
          completed_at_epoch_ms: Date.now(),
        });

        return {
          success: false,
          error: errorMessages,
          shouldRetry: retryCount < (execution.max_retries || 10),
          retryDelaySeconds: Math.pow(2, retryCount) * 5,
        };
      }

      // Add outputs to context for next phase
      for (const [stepName, result] of Object.entries(phaseResult.steps)) {
        if (result.output !== undefined) {
          stepOutputs.set(stepName, result.output);
          lastOutput = result.output;
        }
      }

      // Pattern #6: Reset retry count after successful phase
      await updateExecution(env, executionId, {
        retry_count: 0,
        last_error: undefined,
      });
    }

    // 8. Release lock before triggers
    if (lockId) {
      await releaseLock(env, executionId, lockId);
      lockId = undefined;
    }

    // 9. Fire triggers
    let triggerResults: WorkflowExecutionResult["triggerResults"];
    if (verbose) {
      console.log(
        `[WORKFLOW] Triggers to fire: ${workflowData.triggers?.length || 0}`,
        workflowData.triggers,
      );
    }
    if (workflowData.triggers && workflowData.triggers.length > 0) {
      // Update context with final output
      ctx.output = lastOutput;
      if (verbose) {
        console.log(
          `[WORKFLOW] Firing ${workflowData.triggers.length} triggers with output:`,
          lastOutput,
        );
      }
      triggerResults = await fireTriggers(
        env,
        workflowData.triggers,
        ctx,
        executionId,
      );
      if (verbose) {
        console.log(`[WORKFLOW] Trigger results:`, triggerResults);
      }
    }

    // 10. Mark as completed and reset retry count (Pattern #6: zero retries on success)
    await updateExecution(env, executionId, {
      status: "completed",
      output: lastOutput as Record<string, unknown>,
      completed_at_epoch_ms: Date.now(),
      retry_count: 0,
      last_error: undefined,
    });

    if (verbose) {
      console.log(
        `[WORKFLOW] Execution ${executionId} completed in ${Date.now() - startTime}ms`,
      );
    }

    return {
      success: true,
      output: lastOutput,
      triggerResults,
    };
  } catch (error) {
    console.error(`[WORKFLOW] Execution ${executionId} failed:`, error);

    await updateExecution(env, executionId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      retry_count: retryCount + 1,
      last_error: error instanceof Error ? error.message : String(error),
      last_retry_at: new Date().toISOString(),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      shouldRetry: true,
      retryDelaySeconds: Math.pow(2, retryCount) * 5,
    };
  } finally {
    if (lockId) {
      await releaseLock(env, executionId, lockId);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createProxyConnection(
  integrationId: string,
  opts: { workspace: string; token: string },
) {
  const normalizeWorkspace = (workspace: string): string => {
    if (workspace.startsWith("/users")) return workspace;
    if (workspace.startsWith("/shared")) return workspace;
    if (workspace.includes("/")) return workspace;
    return `/shared/${workspace}`;
  };

  const base = `${normalizeWorkspace(opts.workspace)}/${integrationId}/mcp`;
  const url = new URL(base, "https://api.decocms.com");

  return {
    type: "HTTP",
    url: url.href,
    token: opts.token,
  };
}
