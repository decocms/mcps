import z from "zod";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { executeWorkflow } from "./executor.ts";
import {
  cancelExecution,
  createExecution,
  getExecution,
} from "../lib/execution-db.ts";
import { createQStashScheduler } from "../lib/scheduler.ts";
import { sendSignal } from "./signals.ts";

/**
 * Output schema for workflow execution results.
 * Uses discriminated union for clear, type-safe result handling.
 */
const WorkflowExecutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    output: z.unknown().optional(),
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
  z.object({
    status: z.literal("failed"),
    error: z.string(),
    retryable: z.boolean(),
    retryDelaySeconds: z.number().optional(),
  }),
  z.object({
    status: z.literal("sleeping"),
    wakeAtEpochMs: z.number(),
    stepName: z.string(),
  }),
  z.object({
    status: z.literal("waiting_for_signal"),
    signalName: z.string(),
    stepName: z.string(),
    timeoutAtEpochMs: z.number().optional(),
  }),
  z.object({
    status: z.literal("cancelled"),
  }),
]);

export const executeWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "EXECUTE_WORKFLOW",
    description:
      "Runs a workflow execution. This will acquire a lock on the execution and execute the workflow.",
    inputSchema: z.object({
      executionId: z.string().describe("The execution ID to execute"),
    }),
    outputSchema: WorkflowExecutionResultSchema,
    execute: async ({ context }) => {
      const { executionId } = context;
      const execution = await getExecution(env, executionId);
      if (!execution) {
        return {
          status: "failed" as const,
          error: `Execution ${executionId} not found`,
          retryable: false,
        };
      }

      if (execution.status === "cancelled") {
        return { status: "cancelled" as const };
      }

      if (execution.status === "completed") {
        return {
          status: "completed" as const,
          output: execution.output,
        };
      }

      const scheduler = createQStashScheduler(env);
      return await executeWorkflow(env, scheduler, executionId);
    },
  });

export const createAndQueueExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_AND_QUEUE_EXECUTION",
    description: "Create a workflow execution and queue it for processing",
    inputSchema: z.object({
      workflowId: z.string().describe("The workflow ID to execute"),
      input: z
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
        input: context.input,
      });
      console.log("🚀 ~ execute: ~ execution:", execution);

      const scheduler = createQStashScheduler(env);
      await scheduler.schedule(execution.id, {
        authorization: env.DECO_REQUEST_CONTEXT.token,
      });

      return { success: true, executionId: execution.id };
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
      const { executionId } = context;

      // Get current state first
      const existing = await getExecution(env, executionId);

      if (!existing) {
        return {
          success: false,
          status: "not_found" as const,
          message: `Execution ${executionId} not found`,
        };
      }

      if (existing.status === "cancelled") {
        return {
          success: true,
          status: "already_cancelled" as const,
          execution: {
            id: existing.id,
            status: existing.status,
            workflow_id: existing.workflow_id,
          },
          message: "Execution was already cancelled",
        };
      }

      if (!["pending", "running"].includes(existing.status)) {
        return {
          success: false,
          status: "not_cancellable" as const,
          execution: {
            id: existing.id,
            status: existing.status,
            workflow_id: existing.workflow_id,
          },
          message: `Cannot cancel execution in '${existing.status}' status`,
        };
      }

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
        execution: {
          id: result.id,
          status: result.status,
          workflow_id: result.workflow_id,
        },
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
      resetRetries: z
        .boolean()
        .default(true)
        .describe("Whether to reset the retry count to 0"),
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
      const { executionId, requeue = true, resetRetries = true } = context;

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

      // Import dynamically to avoid circular dependency
      const { resumeExecution } = await import("../lib/execution-db.ts");
      const scheduler = createQStashScheduler(env);

      const result = await resumeExecution(env, scheduler, executionId, {
        resetRetries,
        requeue,
      });

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

      const signal = await sendSignal(env, executionId, {
        name: signalName,
        payload,
        authorization: env.DECO_REQUEST_CONTEXT?.token,
      });

      return {
        success: true,
        signalId: signal.id,
        message: `Signal '${signalName}' sent to execution ${executionId}`,
      };
    },
  });

export const workflowTools = [
  executeWorkflowTool,
  createAndQueueExecutionTool,
  cancelExecutionTool,
  resumeExecutionTool,
  sendSignalTool,
];
