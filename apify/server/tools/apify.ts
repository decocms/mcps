import type { Env } from "server/main";
import { createApifyClient } from "./utils/client";
import type { ActorRun } from "./utils/types";
import {
  listActorsInputSchema,
  getActorInputSchema,
  listActorRunsInputSchema,
  getActorRunInputSchema,
  runActorInputSchema,
  runActorSyncOutputSchema,
  runActorAsyncOutputSchema,
} from "./utils/types";
import { authorizeContract, settleContract } from "./utils/contract";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { APIFY_ERROR_MESSAGES } from "../constants";

// Type for the Apify client returned by createApifyClient
type ApifyClientInstance = ReturnType<typeof createApifyClient>;

const createListActorsTool = (client: ApifyClientInstance) =>
  createPrivateTool({
    id: "LIST_ACTORS",
    description: "List all actors accessible to the user",
    inputSchema: listActorsInputSchema,
    execute: async ({ context }: any) => {
      try {
        return await client.listActors({
          limit: context.limit,
          offset: context.offset,
          my: context.my,
          desc: context.desc,
        });
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

const createGetActorTool = (client: ApifyClientInstance) =>
  createPrivateTool({
    id: "GET_ACTOR",
    description: "Get details of a specific actor",
    inputSchema: getActorInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        return await client.getActor(context.actorId);
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.ACTOR_NOT_FOUND,
        );
      }
    },
  });

const createListActorRunsTool = (client: ApifyClientInstance) =>
  createPrivateTool({
    id: "LIST_ACTOR_RUNS",
    description: "List runs of a specific actor",
    inputSchema: listActorRunsInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        return await client.getActorRuns(context.actorId, {
          limit: context.limit,
          offset: context.offset,
          status: context.status,
          desc: context.desc,
        });
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

const createGetActorRunTool = (client: ApifyClientInstance) =>
  createPrivateTool({
    id: "GET_ACTOR_RUN",
    description: "Get details of a specific actor run",
    inputSchema: getActorRunInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId || !context.runId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        const result = await client.getActorRun(context.actorId, context.runId);

        if (context.includeDatasetItems && result.defaultDatasetId) {
          const itemsResponse = await client.getDatasetItems(
            result.defaultDatasetId,
            {
              limit: 1000,
            },
          );
          return {
            data: {
              ...result,
              results: itemsResponse.data,
            },
          };
        }

        return { data: result };
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.RUN_NOT_FOUND,
        );
      }
    },
  });

const createRunActorSyncTool = (env: Env, client: ApifyClientInstance) =>
  createPrivateTool({
    id: "RUN_ACTOR_SYNC",
    description: "Run an actor synchronously and return dataset items",
    inputSchema: runActorInputSchema,
    outputSchema: runActorSyncOutputSchema,
    execute: async ({ context: ctx }: any) => {
      if (!ctx.actorId) {
        throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
      }

      const parsedInput = JSON.parse(ctx.input);

      // Estimate costs for pre-authorization
      const estimatedTimeout = ctx.timeout || 300; // Default 5 min
      const estimatedMemory = ctx.memory || 256; // Default 256MB
      const estimatedComputeUnits = Math.ceil(
        (estimatedTimeout * estimatedMemory) / 1000,
      );

      let transactionId: string | undefined;

      try {
        transactionId = await authorizeContract(
          env,
          estimatedComputeUnits,
          estimatedMemory,
        );

        const startTime = Date.now();
        const itemsResponse = await client.runActorSyncGetDatasetItems(
          ctx.actorId,
          parsedInput,
          {
            timeout: ctx.timeout,
            memory: ctx.memory,
            build: ctx.build,
          },
        );
        const executionTimeMs = Date.now() - startTime;

        const actualTimeout = Math.ceil(executionTimeMs / 1000);
        const actualMemory = estimatedMemory;
        const actualComputeUnits = Math.ceil(
          (actualTimeout * actualMemory) / 1000,
        );

        await settleContract(
          env,
          transactionId,
          Math.min(actualComputeUnits, estimatedComputeUnits),
          actualMemory,
        );

        return itemsResponse;
      } catch (error) {
        try {
          if (transactionId) {
            await settleContract(env, transactionId, 0, 0);
          } else {
            console.warn(
              "Cannot settle contract: original transactionId not available",
            );
          }
        } catch (settleError) {
          console.error("Failed to settle contract on error:", settleError);
        }

        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

const createRunActorAsyncTool = (env: Env, client: ApifyClientInstance) =>
  createPrivateTool({
    id: "RUN_ACTOR_ASYNC",
    description:
      "Run an actor asynchronously and return immediately without waiting for completion",
    inputSchema: runActorInputSchema,
    outputSchema: runActorAsyncOutputSchema,
    execute: async ({ context: ctx }: any) => {
      if (!ctx.actorId) {
        throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
      }

      const parsedInput = JSON.parse(ctx.input);

      const estimatedTimeout = ctx.timeout || 3600;
      const estimatedMemory = ctx.memory || 256;
      const estimatedComputeUnits = Math.ceil(
        (estimatedTimeout * estimatedMemory) / 1000,
      );

      let transactionId: string | undefined;

      try {
        transactionId = await authorizeContract(
          env,
          estimatedComputeUnits,
          estimatedMemory,
        );

        const result = await client.runActor(ctx.actorId, parsedInput, {
          timeout: ctx.timeout,
          memory: ctx.memory,
          build: ctx.build,
        });

        await settleContract(
          env,
          transactionId,
          estimatedComputeUnits,
          estimatedMemory,
        );

        const runData = result.data as ActorRun;
        return {
          id: runData.id,
          status: runData.status,
          actorId: runData.actId || ctx.actorId,
        };
      } catch (error) {
        try {
          if (transactionId) {
            await settleContract(env, transactionId, 0, 0);
          } else {
            console.warn(
              "Cannot settle contract: original transactionId not available",
            );
          }
        } catch (settleError) {
          console.error("Failed to settle contract on error:", settleError);
        }

        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

export const createApifyTools = (env: Env) => {
  try {
    const client = createApifyClient(env);

    return [
      createListActorsTool(client),
      createGetActorTool(client),
      createListActorRunsTool(client),
      createGetActorRunTool(client),
      createRunActorSyncTool(env, client),
      createRunActorAsyncTool(env, client),
    ];
  } catch (error) {
    console.error("Error creating Apify tools:", error);
    // Return empty array if tools fail to create
    // This allows the MCP to still work with userTools
    return [];
  }
};
