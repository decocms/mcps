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
import { canResolveAllRefs, resolveAllRefs } from "./ref-resolver.ts";
import { getStepResults, updateExecution } from "../lib/execution-db.ts";
import { lockWorkflowExecution, releaseLock } from "./lock.ts";
import type { Step, Trigger } from "@decocms/bindings/workflow";
import { getWorkflow } from "server/tools/workflow.ts";

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

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export async function executeWorkflow(env: Env, executionId: string) {
  let lockId: string | undefined;
  const startTime = Date.now();

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
