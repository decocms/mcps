import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { z } from "zod";
import {
  StepSchema,
  Workflow,
  WORKFLOW_BINDING,
} from "@decocms/bindings/workflow";
import {
  cancelExecution,
  createExecution,
  getExecutionFull,
  getStepResult,
  listExecutions,
  resumeExecution,
} from "../db/queries/executions.ts";
import { validateWorkflow } from "../utils/validator.ts";
import { getWorkflowCollection } from "./workflow.ts";

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
      input: z.record(z.string(), z.unknown()),
      steps: z
        .array(
          z
            .object(StepSchema.omit({ outputSchema: true }).shape)
            .describe(
              "The steps to execute - need to provide this or the workflow_collection_id",
            ),
        )
        .optional(),
      gateway_id: z
        .string()
        .describe("The gateway ID to use for the execution"),
      start_at_epoch_ms: z
        .number()
        .optional()
        .describe("The start time for the execution"),
      timeout_ms: z
        .number()
        .optional()
        .describe("The timeout for the execution"),
      workflow_collection_id: z
        .string()
        .optional()
        .describe(
          "The workflow collection ID to use for the execution - need to provide this or the steps",
        ),
    }),
    outputSchema: z.object({
      id: z.string(),
      workflow_id: z.string(),
    }),
    execute: async ({ context }) => {
      try {
        console.log("creating execution");

        if (!context.steps && !context.workflow_collection_id) {
          throw new Error(
            "Either steps or workflow_collection_id must be provided",
          );
        }

        if (context.steps) {
          // Validate workflow before creating execution
          await validateWorkflow(
            {
              id: "temp-validation",
              title: "Execution Workflow",
              steps: context.steps,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            env,
          );
        }

        const steps =
          context.steps ??
          (
            (await getWorkflowCollection(
              env,
              context.workflow_collection_id ?? "",
            )) as Workflow | null
          )?.steps ??
          [];

        const { id: executionId, workflow_id } = await createExecution(env, {
          input: context.input,
          gateway_id: context.gateway_id,
          start_at_epoch_ms: context.start_at_epoch_ms,
          timeout_ms: context.timeout_ms,
          steps,
          workflow_collection_id: context.workflow_collection_id,
        });
        console.log("publishing event");
        await env.MESH_REQUEST_CONTEXT.state.EVENT_BUS.EVENT_PUBLISH({
          type: "workflow.execution.created",
          subject: executionId,
        });
        return {
          id: executionId,
          workflow_id,
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
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      const result = await getExecutionFull(env, id);
      if (!result) {
        throw new Error("Execution not found");
      }

      // Destructure to exclude workflow_id which is not in the output schema
      const { workflow_id: _, ...execution } = result.execution;

      return {
        item: {
          ...execution,
          completed_steps: result.completed_steps,
        },
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
  createGetStepResultTool,
  createCreateTool,
];

export const workflowTools = [cancelExecutionTool, resumeExecutionTool];
