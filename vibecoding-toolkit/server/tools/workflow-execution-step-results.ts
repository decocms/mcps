import { createPrivateTool } from "@decocms/runtime/tools";
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import { Env } from "../main.ts";
import { z } from "zod";
import {
  WORKFLOW_BINDING,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import { getStepResults } from "../lib/execution-db.ts";

const LIST_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_EXECUTION_STEP_RESULTS_LIST",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_STEP_RESULTS_LIST binding not found or missing schemas",
  );
}

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_EXECUTION_STEP_RESULTS_LIST",
    description:
      "List execution step results with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: createCollectionListOutputSchema(
      WorkflowExecutionStepResultSchema,
    ),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_BINDING.inputSchema>;
    }) => {
      const { where } = context;
      console.log("🚀 ~ context:", context);

      const hasExecutionId =
        where?.operator === "eq" &&
        where?.field?.includes("execution_id") &&
        where?.value !== undefined;
      const executionId = hasExecutionId ? (where?.value as string) : undefined;

      const stepResults = await getStepResults(env, executionId);

      return {
        items: stepResults,
        totalCount: stepResults.length,
        hasMore: false,
      };
    },
  });

export const workflowExecutionStepResultsTools = [createListTool];
