import { createPrivateTool } from "@decocms/runtime/tools";
import { Env } from "../../main.ts";
import { z } from "zod";
import { WORKFLOW_BINDING } from "@decocms/bindings/workflow";
import { getStepResult, getStepResults } from "../../lib/execution-db.ts";

const LIST_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_EXECUTION_STEP_RESULTS_LIST",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_STEP_RESULTS_LIST binding not found or missing schemas",
  );
}

const GET_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_EXECUTION_STEP_RESULTS_GET",
);

if (!GET_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_EXECUTION_STEP_RESULTS_GET binding not found or missing schemas",
  );
}
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: LIST_BINDING.name,
    description:
      "List execution step results with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_BINDING.inputSchema>;
    }) => {
      try {
        const { where } = context;
        const hasExecutionId =
          where?.operator === "eq" &&
          where?.field?.includes("execution_id") &&
          where?.value !== undefined;
        const executionId = hasExecutionId
          ? (where?.value as string)
          : undefined;
        const stepResults = await getStepResults(env, executionId);
        return {
          items: stepResults,
          totalCount: stepResults.length,
          hasMore: false,
        };
      } catch (error) {
        console.error("🚀 ~ error:", error);
        throw error;
      }
    },
  });

const MAX_OUTPUT_SIZE_BYTES = 10_000;

export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: GET_BINDING.name,
    description: "Get a single execution step result by ID",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { id } = context;
      const [executionId, stepId] = id.split(":");
      const stepResult = await getStepResult(env, executionId, stepId);
      if (!stepResult) {
        return {
          item: null,
        };
      }
      const outputString = JSON.stringify(stepResult?.output);
      const outputBytes = new TextEncoder().encode(outputString).length;
      const outputExceedsMaxSize = outputBytes > MAX_OUTPUT_SIZE_BYTES;
      const finalOutput = outputExceedsMaxSize
        ? "[TRUNCATED]" +
          JSON.stringify(stepResult?.output).slice(0, MAX_OUTPUT_SIZE_BYTES)
        : stepResult?.output;
      return {
        item: {
          ...stepResult,
          output: finalOutput,
        },
      };
    },
  });

export const workflowExecutionStepResultsTools = [
  createListTool,
  createGetTool,
];
