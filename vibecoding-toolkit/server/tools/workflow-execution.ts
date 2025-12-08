import {
  createPrivateTool,
  createStreamableTool,
} from "@decocms/runtime/tools";
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
  getStreamChunks,
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

// Schema for stream chunks
const StreamChunkSchema = z.object({
  id: z.string(),
  execution_id: z.string(),
  step_id: z.string(),
  chunk_index: z.number(),
  chunk_data: z.unknown(),
  created_at: z.number(),
});

// Extended schema that includes step_results and stream_chunks
const WorkflowExecutionWithStepResultsSchema = WorkflowExecutionSchema.extend({
  step_results: z.array(WorkflowExecutionStepResultSchema).optional(),
  stream_chunks: z.array(StreamChunkSchema).optional(),
});

/**
 * Streamable tool that polls for workflow execution updates.
 * Emits updates when:
 * - New step results are added
 * - Execution status changes
 * - Execution completes (then closes the stream)
 */
const streamableGetTool = (env: Env) =>
  createStreamableTool({
    id: "STREAM_WORKFLOW_EXECUTION_GET",
    description:
      "Stream a workflow execution by ID with live step result updates",
    inputSchema: GET_BINDING.inputSchema,
    execute: async ({ context }) => {
      const { id } = context;

      const initialExecution = await getExecution(env, id);
      console.log("initialExecution", initialExecution);
      if (!initialExecution) {
        const errorStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              JSON.stringify({ error: "Execution not found", item: null }) +
                "\n",
            );
            controller.close();
          },
        });
        return new Response(errorStream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
          },
        });
      }

      let lastStepCount = -1;
      let lastStatus = "";
      let lastChunkIndices: Record<string, number> = {};

      // Add cleanup tracking
      let isStreamActive = true;
      let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

      console.log("streamableGetTool", { id });
      console.log("initialExecution", initialExecution);

      const stream = new ReadableStream({
        async start(controller) {
          const POLL_INTERVAL_MS = 1000;
          const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
          const startTime = Date.now();

          const poll = async (): Promise<void> => {
            // Check if stream is still active before doing anything
            if (!isStreamActive) {
              return;
            }

            try {
              if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
                controller.enqueue(
                  JSON.stringify({
                    error: "Stream timeout - max duration exceeded",
                  }) + "\n",
                );
                controller.close();
                isStreamActive = false;
                return;
              }

              const execution = await getExecution(env, id);
              if (!execution) {
                controller.enqueue(
                  JSON.stringify({
                    error: "Execution no longer exists",
                    item: null,
                  }) + "\n",
                );
                controller.close();
                isStreamActive = false;
                return;
              }

              const stepResults = await getStepResults(env, id);
              const stepCount = stepResults.length;
              const status = execution.status;

              const newChunks = await getStreamChunks(
                env,
                id,
                lastChunkIndices,
              );

              const hasChanges =
                stepCount !== lastStepCount ||
                status !== lastStatus ||
                newChunks.length > 0;

              if (hasChanges) {
                lastStepCount = stepCount;
                lastStatus = status;

                for (const chunk of newChunks) {
                  const currentMax = lastChunkIndices[chunk.step_id] ?? -1;
                  if (chunk.chunk_index > currentMax) {
                    lastChunkIndices[chunk.step_id] = chunk.chunk_index;
                  }
                }

                // Only enqueue if stream is still active
                if (isStreamActive) {
                  controller.enqueue(
                    JSON.stringify({
                      item: {
                        ...execution,
                        step_results: stepResults,
                        stream_chunks:
                          newChunks.length > 0 ? newChunks : undefined,
                      },
                    }) + "\n",
                  );
                }
              }

              // Check for terminal states (including "pending" with no lock - waiting for signal)
              const terminalStatuses = [
                "completed",
                "failed",
                "cancelled",
                "error",
              ];

              console.log({ status, execution });

              // Also treat as terminal if execution is pending but unlocked (waiting for signal)
              const isWaitingForSignal =
                status === "pending" && !execution.lock_id;
              console.log({ isWaitingForSignal });
              if (terminalStatuses.includes(status)) {
                if (isStreamActive) {
                  console.log("closing stream");
                  controller.close();
                  isStreamActive = false;
                }
                console.log("returning from poll");
                return;
              }

              console.log("scheduling next poll");
              // Schedule next poll only if stream is still active
              if (isStreamActive) {
                pollTimeoutId = setTimeout(() => {
                  poll().catch((err) => {
                    console.error("Poll error:", err);
                    if (isStreamActive) {
                      try {
                        controller.error(err);
                      } catch {
                        // Controller might already be closed
                      }
                      isStreamActive = false;
                    }
                  });
                }, POLL_INTERVAL_MS);
              }
            } catch (err) {
              console.error("Stream error:", err);
              if (isStreamActive) {
                try {
                  controller.error(err);
                } catch {
                  // Controller might already be closed
                }
                isStreamActive = false;
              }
            }
          };

          await poll();
        },

        // Add cancel handler for when client disconnects
        cancel() {
          isStreamActive = false;
          if (pollTimeoutId) {
            clearTimeout(pollTimeoutId);
            pollTimeoutId = null;
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
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

export const workflowExecutionCollectionTools = [
  createListTool,
  createGetTool,
  streamableGetTool,
];
