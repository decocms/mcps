import type { Env } from "../main.ts";
import { CodeAction, getStepType } from "./schema.ts";
import {
  canResolveAllRefs,
  isAtRef,
  type RefContext,
  resolveAllRefs,
  resolveRef,
} from "./ref-resolver.ts";
import { executeCode } from "./transform-executor.ts";
import {
  createStepResult,
  getExecution,
  getStepResult,
  getStepResults,
  updateExecution,
  updateStepResult,
} from "../lib/execution-db.ts";
import { acquireLock, releaseLock } from "../lib/workflow-lock.ts";
import {
  type QueueMessage,
  SleepActionSchema,
  type Step,
  ToolCallActionSchema,
  type Trigger,
} from "../collections/workflow.ts";

export class DurableSleepError extends Error {
  constructor(public remainingMs: number) {
    super(`Durable sleep needs re-scheduling: ${remainingMs}ms remaining`);
    this.name = "DurableSleepError";
  }
}

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

const DEFAULT_LOCK_MS = 5 * 60 * 1000;
const MAX_TRIGGER_ITERATIONS = 100;

async function executeToolStep(
  env: Env,
  step: Step,
  input: Record<string, unknown>,
): Promise<unknown> {
  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) throw new Error("Tool step missing tool configuration");

  const { connectionId, toolName } = parsed.data;
  const connection = createProxyConnection(connectionId, {
    workspace: env.DECO_WORKSPACE,
    token: env.DECO_REQUEST_CONTEXT.token,
  });

  return env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
    connection: connection as any,
    params: { name: toolName, arguments: input },
  });
}

async function executeSleepStep(step: Step, ctx: RefContext): Promise<void> {
  const parsed = SleepActionSchema.safeParse(step.action);
  if (!parsed.success)
    throw new Error("Sleep step missing sleep configuration");

  let sleepMs = "sleepMs" in parsed.data ? parsed.data.sleepMs : 0;

  if ("sleepUntil" in parsed.data) {
    const until = isAtRef(parsed.data.sleepUntil as `@${string}`)
      ? new Date(
          resolveRef(parsed.data.sleepUntil as `@${string}`, ctx)
            .value as string,
        )
      : new Date(parsed.data.sleepUntil);
    sleepMs = Math.max(0, until.getTime() - Date.now());
  }

  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
}

async function executeSingleStep(
  env: Env,
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: RefContext,
): Promise<unknown> {
  const stepType = getStepType(step);

  switch (stepType.type) {
    case "tool":
      return executeToolStep(env, step, resolvedInput);
    case "code": {
      const result = await executeCode(
        (stepType.action as CodeAction).code,
        resolvedInput,
        step.name,
      );
      if (!result.success)
        throw new Error(`Code step ${step.name} failed: ${result.error}`);
      return result.output;
    }
    case "sleep":
      await executeSleepStep(step, ctx);
      return { slept: true };
    default:
      throw new Error(`Unknown step type for step: ${step.name}`);
  }
}

async function executeStepWithForEach(
  env: Env,
  step: Step,
  ctx: RefContext,
): Promise<StepExecutionResult> {
  const startedAt = Date.now();

  try {
    const { resolved: baseInput, errors } = resolveAllRefs(
      step.input || {},
      ctx,
    );
    if (errors?.length) console.warn(`[${step.name}] Ref warnings:`, errors);

    if (!step.forEach) {
      const output = await executeSingleStep(
        env,
        step,
        baseInput as Record<string, unknown>,
        ctx,
      );
      return {
        status: "completed",
        output,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const { value: arrayValue, error } = resolveRef(
      step.forEach as `@${string}`,
      ctx,
    );
    if (error || !Array.isArray(arrayValue)) {
      return {
        status: "failed",
        error: error || `forEach ref must resolve to an array: ${step.forEach}`,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const iterations: StepExecutionResult["iterations"] = [];
    const outputs: unknown[] = [];
    const maxIter = Math.min(arrayValue.length, step.maxIterations || 100);

    for (let i = 0; i < maxIter; i++) {
      const iterCtx: RefContext = { ...ctx, item: arrayValue[i], index: i };
      const { resolved: iterInput } = resolveAllRefs(step.input || {}, iterCtx);

      try {
        const output = await executeSingleStep(
          env,
          step,
          iterInput as Record<string, unknown>,
          iterCtx,
        );
        iterations.push({ index: i, item: arrayValue[i], output });
        outputs.push(output);
      } catch (err) {
        iterations.push({
          index: i,
          item: arrayValue[i],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      status: "completed",
      output: outputs,
      iterations,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      completedAt: Date.now(),
    };
  }
}

async function executeStepWithCheckpoint(
  env: Env,
  step: Step,
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<StepExecutionResult> {
  // Check cached result (deterministic replay)
  const existing = await getStepResult(env, executionId, step.name);
  if (existing?.status === "completed" && existing.output !== undefined) {
    if (verbose) console.log(`[${step.name}] Replaying cached output`);
    return {
      status: "completed",
      output: existing.output,
      startedAt: existing.started_at_epoch_ms || Date.now(),
      completedAt: existing.completed_at_epoch_ms ?? undefined,
    };
  }

  // Try to claim this step (detect contention)
  const { result: stepRecord, created } = await createStepResult(env, {
    execution_id: executionId,
    step_id: step.name,
    status: "running",
    started_at_epoch_ms: Date.now(),
  });

  if (!created) {
    if (stepRecord.status === "completed" && stepRecord.output !== undefined) {
      return {
        status: "completed",
        output: stepRecord.output,
        startedAt: stepRecord.started_at_epoch_ms || Date.now(),
        completedAt: stepRecord.completed_at_epoch_ms ?? undefined,
      };
    }
    if (stepRecord.status === "failed") {
      return {
        status: "failed",
        error: stepRecord.error || "Step failed on another worker",
        startedAt: stepRecord.started_at_epoch_ms || Date.now(),
        completedAt: stepRecord.completed_at_epoch_ms ?? undefined,
      };
    }
    throw new Error(
      `CONTENTION: Step ${step.name} is being executed by another worker`,
    );
  }

  const result = await executeStepWithForEach(env, step, ctx);

  await updateStepResult(env, executionId, step.name, {
    status: result.status === "completed" ? "completed" : "failed",
    output: result.output,
    error: result.error,
    completed_at_epoch_ms: result.completedAt,
  });

  return result;
}

async function executePhase(
  env: Env,
  phase: Step[],
  ctx: RefContext,
  executionId: string,
  verbose: boolean,
): Promise<Record<string, StepExecutionResult>> {
  const results = await Promise.allSettled(
    phase.map((step) =>
      executeStepWithCheckpoint(env, step, ctx, executionId, verbose),
    ),
  );

  const stepResults: Record<string, StepExecutionResult> = {};

  for (let i = 0; i < phase.length; i++) {
    const step = phase[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      stepResults[step.name] = result.value;
    } else {
      const error = result.reason?.message || String(result.reason);
      stepResults[step.name] = {
        status: "failed",
        error,
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
      try {
        await updateStepResult(env, executionId, step.name, {
          status: "failed",
          error,
          completed_at_epoch_ms: Date.now(),
        });
      } catch {}
    }
  }

  return stepResults;
}

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
      if (!trigger.forEach && !canResolveAllRefs(trigger.inputs, ctx)) {
        results.push({ triggerId, status: "skipped" });
        continue;
      }

      if (trigger.forEach) {
        const { value: arr, error } = resolveRef(
          trigger.forEach as `@${string}`,
          ctx,
        );

        if (error || !Array.isArray(arr)) {
          results.push({
            triggerId,
            status: "failed",
            error: error || "forEach must resolve to array",
          });
          continue;
        }
        if (arr.length === 0) {
          results.push({ triggerId, status: "triggered", executionIds: [] });
          continue;
        }
        if (arr.length > MAX_TRIGGER_ITERATIONS) {
          results.push({
            triggerId,
            status: "failed",
            error: `forEach array too large: ${arr.length} (max ${MAX_TRIGGER_ITERATIONS})`,
          });
          continue;
        }

        const executionIds = await Promise.all(
          arr.map((item, j) =>
            enqueueTrigger(
              env,
              trigger,
              { ...ctx, item, index: j },
              parentExecutionId,
            ),
          ),
        );
        results.push({ triggerId, status: "triggered", executionIds });
      } else {
        const execId = await enqueueTrigger(
          env,
          trigger,
          ctx,
          parentExecutionId,
        );
        results.push({
          triggerId,
          status: "triggered",
          executionIds: [execId],
        });
      }
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
  const { resolved: inputs } = resolveAllRefs(trigger.inputs, ctx);
  const executionId = crypto.randomUUID();

  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `INSERT INTO workflow_executions (id, workflow_id, status, created_at, updated_at, inputs, parent_execution_id)
          VALUES ($1, $2, 'pending', $3, $3, $4, $5)`,
    params: [
      executionId,
      trigger.workflowId,
      Date.now(),
      JSON.stringify(inputs),
      parentExecutionId,
    ],
  });

  await env.WORKFLOW_QUEUE.send({
    executionId,
    retryCount: 0,
    enqueuedAt: Date.now(),
    authorization: env.DECO_REQUEST_CONTEXT.token,
  } satisfies QueueMessage);

  return executionId;
}

export async function executeWorkflow(
  env: Env,
  executionId: string,
  retryCount = 0,
  config: ExecutorConfig = {},
): Promise<WorkflowExecutionResult> {
  const { lockDurationMs = DEFAULT_LOCK_MS, verbose = true } = config;
  let lockId: string | undefined;
  const startTime = Date.now();

  try {
    const preCheck = await getExecution(env, executionId);
    if (!preCheck)
      return {
        success: false,
        error: `Execution ${executionId} not found`,
        shouldRetry: false,
      };
    if (!["pending", "running"].includes(preCheck.status)) {
      return { success: true, output: preCheck.output };
    }

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

    const execution = await getExecution(env, executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (!["pending", "running"].includes(execution.status)) {
      return { success: true, output: execution.output };
    }

    const { item: workflow } = await env.SELF.COLLECTION_WORKFLOW_GET({
      id: execution.workflow_id,
    });
    if (!workflow)
      throw new Error(`Workflow ${execution.workflow_id} not found`);

    const parsedSteps = workflow.steps
      ? typeof workflow.steps === "string"
        ? JSON.parse(workflow.steps)
        : workflow.steps
      : { phases: [], triggers: [] };

    const phases: Step[][] = parsedSteps.phases || parsedSteps;
    const triggers: Trigger[] = parsedSteps.triggers || workflow.triggers || [];
    const workflowInput =
      typeof execution.inputs === "string"
        ? JSON.parse(execution.inputs)
        : execution.inputs || {};

    if (execution.status === "pending") {
      await updateExecution(env, executionId, {
        status: "running",
        started_at_epoch_ms: startTime,
      });
    }

    const stepOutputs = new Map<string, unknown>();
    for (const sr of await getStepResults(env, executionId)) {
      if (sr.status === "completed" && sr.output !== undefined) {
        stepOutputs.set(sr.step_id, sr.output);
      }
    }

    const ctx: RefContext = { stepOutputs, workflowInput };
    let lastOutput: unknown;

    for (let pi = 0; pi < phases.length; pi++) {
      if (verbose)
        console.log(`[WORKFLOW] Phase ${pi} (${phases[pi].length} steps)`);

      const stepResults = await executePhase(
        env,
        phases[pi],
        ctx,
        executionId,
        verbose,
      );
      const failures = Object.entries(stepResults).filter(
        ([, r]) => r.status === "failed",
      );

      if (failures.length) {
        const errorMsg = failures
          .map(([n, r]) => `${n}: ${r.error}`)
          .join("; ");
        await updateExecution(env, executionId, {
          status: "failed",
          error: errorMsg,
          completed_at_epoch_ms: Date.now(),
        });
        return {
          success: false,
          error: errorMsg,
          shouldRetry: retryCount < (execution.max_retries || 10),
          retryDelaySeconds: Math.pow(2, retryCount) * 5,
        };
      }

      for (const [name, result] of Object.entries(stepResults)) {
        if (result.output !== undefined) {
          stepOutputs.set(name, result.output);
          lastOutput = result.output;
        }
      }

      await updateExecution(env, executionId, { retry_count: 0 });
    }

    if (lockId) {
      await releaseLock(env, executionId, lockId);
      lockId = undefined;
    }

    let triggerResults: WorkflowExecutionResult["triggerResults"];
    if (triggers.length) {
      ctx.output = lastOutput;
      triggerResults = await fireTriggers(env, triggers, ctx, executionId);
    }

    await updateExecution(env, executionId, {
      status: "completed",
      output: lastOutput as Record<string, unknown>,
      completed_at_epoch_ms: Date.now(),
      retry_count: 0,
    });

    if (verbose)
      console.log(
        `[WORKFLOW] ${executionId} completed in ${Date.now() - startTime}ms`,
      );
    return { success: true, output: lastOutput, triggerResults };
  } catch (err) {
    console.error(`[WORKFLOW] ${executionId} failed:`, err);
    await updateExecution(env, executionId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      retry_count: retryCount + 1,
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      shouldRetry: true,
      retryDelaySeconds: Math.pow(2, retryCount) * 5,
    };
  } finally {
    if (lockId) await releaseLock(env, executionId, lockId);
  }
}

function createProxyConnection(
  integrationId: string,
  opts: { workspace: string; token: string },
) {
  const normalize = (ws: string) =>
    ws.startsWith("/users") || ws.startsWith("/shared") || ws.includes("/")
      ? ws
      : `/shared/${ws}`;

  return {
    type: "HTTP",
    url: new URL(
      `${normalize(opts.workspace)}/${integrationId}/mcp`,
      "https://api.decocms.com",
    ).href,
    token: opts.token,
  };
}
