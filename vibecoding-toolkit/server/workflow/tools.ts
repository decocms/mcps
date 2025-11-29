/**
 * Workflow Tools
 *
 * MCP tools for phase-based workflow management:
 * - EXECUTE_WORKFLOW: Execute a workflow
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import z from "zod";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { executeWorkflow } from "./executor.ts";
import { createExecution } from "../lib/execution-db.ts";
import { type QueueMessage } from "../collections/workflow.ts";
import { runFullRecovery } from "../lib/orphan-recovery.ts";

// ============================================================================
// Execution Tools
// ============================================================================

export const executeWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "START_EXECUTION",
    description: "Execute a workflow with durable execution guarantees",
    inputSchema: z.object({
      executionId: z.string().describe("The workflow execution ID to process"),
      retryCount: z
        .number()
        .default(0)
        .describe("Current retry count (managed by queue)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.unknown().optional(),
      error: z.string().optional(),
      shouldRetry: z.boolean().optional(),
      retryDelaySeconds: z.number().optional(),
      triggerResults: z
        .array(
          z.object({
            triggerId: z.string(),
            status: z.enum(["triggered", "skipped", "failed"]),
            executionIds: z.array(z.string()).optional(),
            error: z.string().optional(),
          }),
        )
        .optional(),
    }),
    execute: async ({ context }) => {
      const { executionId, retryCount = 0 } = context;
      return await executeWorkflow(env, executionId, retryCount);
    },
  });

export const createAndQueueExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_AND_QUEUE_EXECUTION",
    description: "Create a workflow execution and queue it for processing",
    inputSchema: z.object({
      workflowId: z.string().describe("The workflow ID to execute"),
      inputs: z
        .record(z.unknown())
        .optional()
        .describe("Input data for the workflow"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      executionId: z.string(),
    }),
    execute: async ({ context }) => {
      console.log("🚀 ~ execute: ~ context:", context);
      const execution = await createExecution(env, {
        workflow_id: context.workflowId,
        status: "pending",
        inputs: context.inputs,
      });
      console.log("🚀 ~ execute: ~ execution:", execution);

      const message: QueueMessage = {
        executionId: execution.id,
        retryCount: 0,
        enqueuedAt: Date.now(),
        authorization: env.DECO_REQUEST_CONTEXT.token,
      };

      await env.WORKFLOW_QUEUE.send(message);

      return { success: true, executionId: execution.id };
    },
  });

export const recoverOrphansTool = (env: Env) =>
  createPrivateTool({
    id: "RECOVER_ORPHAN_EXECUTIONS",
    description:
      "Recover orphaned and stuck workflow executions. Finds executions that got stuck due to worker crashes or network issues and re-queues them. Use force=true to recover immediately without waiting for lock expiry (useful for dev/testing when you know all workers are dead).",
    inputSchema: z.object({
      limit: z
        .number()
        .default(100)
        .describe("Maximum number of executions to recover"),
      lockExpiryBufferMs: z
        .number()
        .default(60000)
        .describe("How long a lock must be expired before recovery (ms)"),
      maxAgeMs: z
        .number()
        .default(24 * 60 * 60 * 1000)
        .describe("Maximum age of executions to recover (ms)"),
      force: z
        .boolean()
        .default(false)
        .describe(
          "Force recovery even if locks haven't expired. USE WITH CAUTION: may cause duplicate execution if workers are still running.",
        ),
    }),
    outputSchema: z.object({
      orphans: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
        recoveredIds: z.array(z.string()),
        failedIds: z.array(z.string()),
      }),
      pending: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
        recoveredIds: z.array(z.string()),
        failedIds: z.array(z.string()),
      }),
      total: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
      }),
    }),
    execute: async ({ context }) => {
      const result = await runFullRecovery(
        env,
        {
          limit: context.limit,
          lockExpiryBufferMs: context.lockExpiryBufferMs,
          maxAgeMs: context.maxAgeMs,
          force: context.force,
          verbose: true,
        },
        env.DECO_REQUEST_CONTEXT.token,
      );
      return result;
    },
  });

// ============================================================================
// Export
// ============================================================================

export const workflowTools = [
  executeWorkflowTool,
  createAndQueueExecutionTool,
  recoverOrphansTool,
];
