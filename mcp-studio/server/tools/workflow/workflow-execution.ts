import { createPrivateTool } from "@decocms/runtime/tools";
import { Env } from "../../main.ts";
import { z } from "zod";
import { WORKFLOW_BINDING } from "@decocms/bindings/workflow";
import {
  getStepResults,
  getExecution,
  listExecutions,
} from "../../lib/execution-db.ts";

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

const MAX_OUTPUT_SIZE_BYTES = 500_000;

function getByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function truncateLargeOutput(
  output: unknown,
  budgetBytes: number = MAX_OUTPUT_SIZE_BYTES,
): unknown {
  const currentSize = getByteSize(output);

  // Already under budget
  if (currentSize <= budgetBytes) {
    return output;
  }

  // Handle strings - truncate to fit budget
  if (typeof output === "string") {
    const overhead = 2; // quotes in JSON
    const targetBytes = Math.max(0, budgetBytes - overhead - 15); // room for "[TRUNCATED]"
    return "[TRUNCATED]" + truncateStringToBytes(output, targetBytes);
  }

  // Handle arrays - truncate items if too many
  if (Array.isArray(output)) {
    if (output.length === 0) return output;

    // Estimate per-item budget (rough, accounts for commas/brackets)
    const overhead = 2; // []
    const availableBudget = budgetBytes - overhead;

    // Binary search for how many items we can keep
    let kept = findMaxItems(output, availableBudget);

    if (kept < output.length) {
      const truncatedArray = output.slice(0, kept).map((item) => {
        const itemBudget = Math.floor(availableBudget / kept);
        return truncateLargeOutput(item, itemBudget);
      });

      // Add truncation marker
      truncatedArray.push(`[... ${output.length - kept} more items truncated]`);
      return truncatedArray;
    }

    // All items fit, but still over budget - truncate each item
    const itemBudget = Math.floor(availableBudget / output.length);
    return output.map((item) => truncateLargeOutput(item, itemBudget));
  }

  // Handle objects - distribute budget across properties
  if (typeof output === "object" && output !== null) {
    const entries = Object.entries(output);
    if (entries.length === 0) return output;

    const overhead = 2; // {}
    const availableBudget = budgetBytes - overhead;

    // First pass: measure each property
    const measured = entries.map(([key, value]) => ({
      key,
      value,
      size: getByteSize({ [key]: value }),
    }));

    const totalSize = measured.reduce((sum, m) => sum + m.size, 0);

    // Distribute budget proportionally (larger props get more budget)
    const result: Record<string, unknown> = {};
    for (const { key, value, size } of measured) {
      const propBudget = Math.floor((size / totalSize) * availableBudget);
      const keyOverhead = getByteSize(key) + 3; // "key":
      result[key] = truncateLargeOutput(
        value,
        Math.max(50, propBudget - keyOverhead),
      );
    }
    const finalSize = getByteSize(result);

    if (finalSize > budgetBytes) {
      // Fallback: just stringify and cut
      const str = JSON.stringify(result);
      return {
        _truncated: true,
        _originalSize: finalSize,
        _preview: str.slice(0, budgetBytes - 100) + "...",
      };
    }

    return result;
  }

  return output;
}

function findMaxItems(arr: unknown[], budgetBytes: number): number {
  // Quick estimate: try to fit as many items as possible
  let size = 2; // []
  let count = 0;

  for (const item of arr) {
    const itemSize = getByteSize(item) + 1; // +1 for comma
    if (size + itemSize > budgetBytes) break;
    size += itemSize;
    count++;
  }

  return Math.max(1, count); // Keep at least 1 item
}

function truncateStringToBytes(str: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";

  const encoder = new TextEncoder();
  if (encoder.encode(str).length <= maxBytes) return str;

  // Binary search for cut point
  let low = 0,
    high = str.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encoder.encode(str.slice(0, mid)).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return str.slice(0, low);
}

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

      const execution = await getExecution(env, id);

      if (!execution) {
        return { item: null };
      }

      // Join step results
      const stepResults = await getStepResults(env, id);
      const perStepBudget = Math.floor(
        MAX_OUTPUT_SIZE_BYTES / stepResults.length,
      );
      const truncatedStepResults = stepResults.map((sr) => ({
        ...sr,
        output: truncateLargeOutput(sr.output, perStepBudget),
      }));

      return {
        item: {
          ...execution,
          step_results: truncatedStepResults,
        },
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

export const workflowExecutionCollectionTools = [createListTool, createGetTool];
