import z from "zod";
import type { Env } from "../../main.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  cancelExecution,
  createExecution,
  getExecution,
  processEnqueuedExecutions,
  resumeExecution,
} from "../../lib/execution-db.ts";
import { sendSignal } from "../../workflow/events/events.ts";
import { WORKFLOW_BINDING } from "@decocms/bindings/workflow";

const START_BINDING = WORKFLOW_BINDING.find((b) => b.name === "WORKFLOW_START");

if (!START_BINDING?.inputSchema || !START_BINDING?.outputSchema) {
  throw new Error("WORKFLOW_START binding not found or missing schemas");
}

export const createAndQueueExecutionTool = (env: Env) =>
  createPrivateTool({
    id: START_BINDING?.name,
    description:
      "Create a workflow execution and immediately start processing it (serverless mode)",
    inputSchema: START_BINDING.inputSchema,
    outputSchema: START_BINDING.outputSchema,
    execute: async ({ context, runtimeContext }) => {
      try {
        const execution = await createExecution(env, {
          workflow_id: context.workflowId,
          input: context.input,
          start_at_epoch_ms: context.startAtEpochMs,
          timeout_ms: context.timeoutMs,
        });

        processEnqueuedExecutionsTool(env)
          .execute({
            context: {
              executionId: execution.id,
            },
            runtimeContext,
          })
          .catch((error) => {
            console.error("🚀 ~ Error executing workflow:", error);
            throw error;
          });

        return {
          executionId: execution.id,
        };
      } catch (error) {
        console.error("🚀 ~ Error creating and queueing execution:", error);
        throw error;
      }
    },
  });

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

export const sendSignalTool = (env: Env) =>
  createPrivateTool({
    id: "SEND_SIGNAL",
    description:
      "Send a signal to a running workflow execution. Signals allow external systems to inject data or events into workflows. The workflow can receive these signals at step boundaries using the signal API.",
    inputSchema: z.object({
      executionId: z.string().describe("The execution ID to send signal to"),
      signalName: z
        .string()
        .describe("Name of the signal (used by workflow to filter)"),
      payload: z
        .unknown()
        .optional()
        .describe("Optional data payload to send with the signal"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      signalId: z.string().optional(),
      message: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { executionId, signalName, payload } = context;

      const execution = await getExecution(env, executionId);
      if (!execution) {
        return {
          success: false,
          message: `Execution ${executionId} not found`,
        };
      }

      const signal = await sendSignal(env, executionId, signalName, payload);

      return {
        success: true,
        signalId: signal.id,
        message: `Signal '${signalName}' sent to execution ${executionId}`,
      };
    },
  });

export const processEnqueuedExecutionsTool = (env: Env) =>
  createPrivateTool({
    id: "PROCESS_ENQUEUED_EXECUTIONS",
    description: "Process enqueued workflow executions",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      ids: z.array(z.string()),
    }),
    execute: async () => {
      try {
        const ids = await processEnqueuedExecutions(env);
        console.log(
          `[PROCESS_ENQUEUED_EXECUTIONS] ids: ${JSON.stringify(ids)}`,
        );
        return { success: true, ids };
      } catch (error) {
        console.error("🚀 ~ Error processing enqueued executions:", error);
        return { success: false, ids: [] };
      }
    },
  });

export const workflowTools = [
  createAndQueueExecutionTool,
  cancelExecutionTool,
  resumeExecutionTool,
  sendSignalTool,
  processEnqueuedExecutionsTool,
];
