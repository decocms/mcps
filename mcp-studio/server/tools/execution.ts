import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { z } from "zod";
import {
  StepSchema,
  WORKFLOW_BINDING,
  WorkflowExecutionSchema,
} from "@decocms/bindings/workflow";
import {
  cancelExecution,
  createExecution,
  getExecution,
  getExecutionFull,
  getStepResult,
  getWorkflow,
  listExecutions,
  resumeExecution,
} from "../db/queries/executions.ts";
import { getWorkflowCollection } from "./workflow.ts";
import { createCollectionGetOutputSchema } from "@decocms/bindings/collections";

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

      await env.MESH_REQUEST_CONTEXT.state.EVENT_BUS.EVENT_PUBLISH({
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
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "The input to the workflow execution. Required only if the workflow has steps that reference the input with the @input.field syntax.",
        ),
      virtual_mcp_id: z
        .string()
        .describe("The gateway ID to use for the execution"),
      start_at_epoch_ms: z
        .number()
        .optional()
        .describe(
          "The timestamp in milliseconds of when the execution should start. If not provided, the execution will start immediately.",
        ),
      workflow_collection_id: z
        .string()
        .describe(
          "The id of the workflow collection item to use for the execution",
        ),
    }),
    outputSchema: z.object({
      item: z.object({
        id: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      try {
        // Fetch the full workflow collection to get steps and input schema
        const workflowCollection = await getWorkflowCollection(
          env,
          context.workflow_collection_id,
        );

        if (!workflowCollection) {
          throw new Error(
            `Workflow collection not found: ${context.workflow_collection_id}`,
          );
        }
        const steps = workflowCollection.steps ?? [];

        const { id: executionId } = await createExecution(env, {
          input: context.input,
          gateway_id: context.virtual_mcp_id,
          start_at_epoch_ms: context.start_at_epoch_ms,
          workflow_collection_id: context.workflow_collection_id,
          steps,
        });
        await env.MESH_REQUEST_CONTEXT.state.EVENT_BUS.EVENT_PUBLISH({
          type: "workflow.execution.created",
          subject: executionId,
        });
        return {
          item: {
            id: executionId,
          },
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
    description: "Get a single workflow execution by ID with step results.",
    inputSchema: z.object({
      id: z.string().describe("The ID of the workflow execution to get"),
    }),
    outputSchema: createCollectionGetOutputSchema(WorkflowExecutionSchema),
    execute: async ({ context }) => {
      const { id } = context;
      const result = await getExecutionFull(env, id);
      if (!result) {
        throw new Error("Execution not found");
      }
      const execution = result.execution;
      if (!execution) {
        throw new Error("Execution not found");
      }
      return {
        item: {
          ...execution,
          virtual_mcp_id: execution.virtual_mcp_id,
        },
      };
    },
  });

export const createGetExecutionWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "WORKFLOW_EXECUTION_GET_WORKFLOW",
    description:
      "Get the immutable workflow associated with a workflow execution",
    inputSchema: z.object({
      executionId: z
        .string()
        .describe("The ID of the workflow execution to get the workflow for"),
    }),
    outputSchema: z.object({
      steps: z.array(StepSchema.omit({ outputSchema: true })),
      input: z.record(z.string(), z.unknown()).nullish(),
      virtual_mcp_id: z.string(),
      created_at_epoch_ms: z.number(),
      id: z.string(),
      workflow_collection_id: z.string().nullish(),
    }),
    execute: async ({ context }) => {
      const { executionId } = context;
      const execution = await getExecution(env, executionId);
      if (!execution) {
        throw new Error("Execution not found");
      }

      const workflow = await getWorkflow(env, execution.workflow_id);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      return {
        id: workflow.id,
        workflow_collection_id: workflow.workflow_collection_id,
        steps: workflow.steps.map((step) => ({
          ...step,
          outputSchema: undefined,
        })),
        input: workflow.input,
        virtual_mcp_id: workflow.gateway_id,
        created_at_epoch_ms: workflow.created_at_epoch_ms,
      };
    },
  });

export const createGetStepResultTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_EXECUTION_GET_STEP_RESULT",
    description: "Get a single step result by execution ID and step ID",
    inputSchema: z.object({
      executionId: z
        .string()
        .describe("The execution ID to get the step result from"),
      stepId: z.string().describe("The step ID to get the step result for"),
    }),
    outputSchema: z.object({
      output: z.unknown().optional(),
      error: z.string().nullable().optional(),
    }),
    execute: async ({ context }) => {
      const { executionId, stepId } = context;

      const result = await getStepResult(env, executionId, stepId);
      if (!result) {
        throw new Error("Step result not found");
      }

      return {
        output: result.output,
        error:
          typeof result.error === "string"
            ? result.error
            : typeof result.error === "object"
              ? JSON.stringify(result.error)
              : undefined,
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
      const { limit = 50, offset = 0 } = context;

      const itemsResult = await listExecutions(env, {
        limit,
        offset,
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
  createGetExecutionWorkflowTool,
  createGetStepResultTool,
  createCreateTool,
];

export const workflowTools = [cancelExecutionTool, resumeExecutionTool];
