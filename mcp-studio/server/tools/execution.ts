import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { z } from "zod";
import { WORKFLOW_BINDING } from "@decocms/bindings/workflow";
import {
  getStepResults,
  getExecution,
  listExecutions,
  createExecution,
  cancelExecution,
  resumeExecution,
} from "../db/queries/executions.ts";
import { getWorkflow } from "./workflow.ts";
import { buildWhereClause } from "./_helpers.ts";

const LIST_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_EXECUTION_LIST",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_LIST binding not found or missing schemas",
  );
}

const GET_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_EXECUTION_GET",
);

if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_GET binding not found or missing schemas",
  );
}

const CREATE_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_EXECUTION_CREATE",
);

if (!CREATE_BINDING?.inputSchema || !CREATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_GET binding not found or missing schemas",
  );
}

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

export const createCreateTool = (env: Env) =>
  createPrivateTool({
    id: CREATE_BINDING?.name,
    description: "Create a workflow execution and return the execution ID",
    inputSchema: z.object({
      workflow_id: z.string(),
      input: z.record(z.unknown()),
      start_at_epoch_ms: z.number(),
      timeout_ms: z.number(),
    }),
    outputSchema: z.object({
      id: z.string(),
    }),
    execute: async ({ context }) => {
      const workflow = await getWorkflow(env, context.workflow_id);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      try {
        const { id: executionId } = await createExecution(env, {
          workflow_id: workflow.id,
          input: context.input,
          start_at_epoch_ms: context.start_at_epoch_ms,
          timeout_ms: context.timeout_ms,
          steps: workflow.steps,
        });
        await env.EVENT_BUS.EVENT_PUBLISH({
          type: "workflow.execution.created",
          subject: executionId,
        });
        return {
          id: executionId,
        };
      } catch (error) {
        console.error("🚀 ~ Error creating and queueing execution:", error);
        throw error;
      }
    },
  });

export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_EXECUTION_GET",
    description: "Get a single workflow execution by ID with step results",
    inputSchema: GET_BINDING.inputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      const execution = await getExecution(env, id);

      if (!execution) {
        throw new Error("Execution not found");
      }

      const stepResults = await getStepResults(env, id);
      return {
        item: execution,
        step_results: stepResults,
      };
    },
  });

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_EXECUTION_LIST",
    description:
      "List workflow executions with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_BINDING.inputSchema>;
    }) => {
      const { limit = 50, offset = 0, where } = context;

      const whereClause = buildWhereClause(where);

      const itemsResult = await listExecutions(env, {
        limit,
        offset,
        workflowId: whereClause.params[0] as string,
      });

      return {
        items: itemsResult.items,
        totalCount: itemsResult.totalCount,
        hasMore: itemsResult.hasMore,
      };
    },
  });

export const workflowExecutionCollectionTools = [
  createListTool,
  createGetTool,
  createCreateTool,
];

export const workflowTools = [cancelExecutionTool, resumeExecutionTool];
