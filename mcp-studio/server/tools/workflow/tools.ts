import z from "zod";
import type { Env } from "../../types/env.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  cancelExecution,
  getExecution,
  resumeExecution,
} from "../../lib/execution-db.ts";

export const cancelExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "CANCEL_EXECUTION",
    description:
      "Cancel a running or pending workflow execution. Currently executing steps will complete, but no new steps will start. The execution can be resumed later using RESUME_EXECUTION.",
    inputSchema: z.object({
      executionId: z.string().describe("The execution ID to cancel"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      status: z
        .enum([
          "cancelled",
          "already_cancelled",
          "not_cancellable",
          "not_found",
        ])
        .describe("Result of the cancellation attempt"),
      executionId: z.string().optional(),
      message: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { executionId } = context;

      const result = await cancelExecution(env, executionId);

      if (!result) {
        return {
          success: false,
          status: "not_found" as const,
          message: "Failed to cancel execution",
        };
      }

      return {
        success: true,
        status: "cancelled" as const,
        executionId: result!,
        message: "Execution cancelled successfully",
      };
    },
  });

export const resumeExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "RESUME_EXECUTION",
    description:
      "Resume a cancelled workflow execution. The execution will be set back to pending and can be re-queued for processing.",
    inputSchema: z.object({
      executionId: z.string().describe("The execution ID to resume"),
      requeue: z
        .boolean()
        .default(true)
        .describe(
          "Whether to immediately re-queue the execution for processing",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      status: z
        .enum(["resumed", "not_resumable", "not_found"])
        .describe("Result of the resume attempt"),
      execution: z
        .object({
          id: z.string(),
          status: z.string(),
          workflow_id: z.string(),
        })
        .optional(),
      message: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { executionId, requeue = true } = context;

      const existing = await getExecution(env, executionId);

      if (!existing) {
        return {
          success: false,
          status: "not_found" as const,
          message: `Execution ${executionId} not found`,
        };
      }

      if (!["cancelled"].includes(existing.status)) {
        return {
          success: false,
          status: "not_resumable" as const,
          execution: {
            id: existing.id,
            status: existing.status,
            workflow_id: existing.workflow_id,
          },
          message: `Cannot resume execution in '${existing.status}' status. Only cancelled or failed executions can be resumed.`,
        };
      }

      const result = await resumeExecution(env, executionId);

      if (!result) {
        return {
          success: false,
          status: "not_found" as const,
          message: "Failed to resume execution",
        };
      }

      return {
        success: true,
        status: "resumed" as const,
        execution: {
          id: result.id,
          status: result.status,
          workflow_id: result.workflow_id,
        },
        message: requeue
          ? "Execution resumed and re-queued for processing"
          : "Execution resumed (not re-queued)",
      };
    },
  });
export const workflowTools = [cancelExecutionTool, resumeExecutionTool];
