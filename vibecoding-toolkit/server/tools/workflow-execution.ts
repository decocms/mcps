import { createPrivateTool } from "@decocms/runtime/tools";
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import { Env } from "../main.ts";
import { z } from "zod";
import {
  WORKFLOW_BINDING,
  WorkflowExecutionSchema,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import {
  getStepResults,
  getExecution,
  listExecutions,
} from "../lib/execution-db.ts";

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

// Extended schema that includes step_results
const WorkflowExecutionWithStepResultsSchema = WorkflowExecutionSchema.extend({
  step_results: z.array(WorkflowExecutionStepResultSchema).optional(),
});

export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_EXECUTION_GET",
    description: "Get a single workflow execution by ID with step results",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: z.object({
      item: WorkflowExecutionWithStepResultsSchema.nullable(),
    }),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      const execution = await getExecution(env, id);

      if (!execution) {
        return { item: null };
      }

      // Join step results
      const stepResults = await getStepResults(env, id);
      console.log("🚀 ~ stepResults:", stepResults);

      return {
        item: {
          ...execution,
          step_results: stepResults,
        },
      };
    },
  });

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_EXECUTION_LIST",
    description:
      "List workflow executions with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: createCollectionListOutputSchema(WorkflowExecutionSchema),
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

export const workflowExecutionCollectionTools = [createListTool, createGetTool];
