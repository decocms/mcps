import z from "zod";
import type { Env } from "../../types/env.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import { cancelExecution, resumeExecution } from "../../lib/execution-db.ts";

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
    }),
    execute: async ({ context }) => {
      const { executionId } = context;

      const result = await cancelExecution(env, executionId);

      if (!result) {
        return {
          success: false,
        };
      }

      return {
        success: true,
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
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const { executionId } = context;

      const result = await resumeExecution(env, executionId);

      if (!result) {
        return {
          success: false,
        };
      }

      await env.EVENT_BUS.EVENT_PUBLISH({
        type: "workflow.execution.created",
        subject: executionId,
      });

      return {
        success: true,
      };
    },
  });
export const workflowTools = [cancelExecutionTool, resumeExecutionTool];
