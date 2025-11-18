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
import { createPrivateTool } from "@decocms/runtime/mastra";
import { APIFY_ERROR_MESSAGES } from "../constants";

/**
 * Create List Actors Tool
 */
export const createListActorsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_ACTORS",
    description: "List all actors accessible to the user",
    inputSchema: listActorsInputSchema,
    execute: async ({ context }: any) => {
      try {
        const client = createApifyClient(env);
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

/**
 * Create Get Actor Tool
 */
export const createGetActorTool = (env: Env) =>
  createPrivateTool({
    id: "GET_ACTOR",
    description: "Get details of a specific actor",
    inputSchema: getActorInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        const client = createApifyClient(env);
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

/**
 * Create List Actor Runs Tool
 */
export const createListActorRunsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_ACTOR_RUNS",
    description: "List runs of a specific actor",
    inputSchema: listActorRunsInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        const client = createApifyClient(env);
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

/**
 * Create Get Actor Run Tool
 */
export const createGetActorRunTool = (env: Env) =>
  createPrivateTool({
    id: "GET_ACTOR_RUN",
    description: "Get details of a specific actor run",
    inputSchema: getActorRunInputSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId || !context.runId) {
          throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
        }
        const client = createApifyClient(env);
        const result = await client.getActorRun(context.actorId, context.runId);

        if (context.includeDatasetItems && result.defaultDatasetId) {
          const items = await client.getDatasetItems(result.defaultDatasetId, {
            limit: 1000,
          });
          return {
            data: {
              ...result,
              results: items,
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

/**
 * Create Run Actor Synchronously Tool
 * With inline contract support and precise settlement
 */
export const createRunActorSyncTool = (env: Env) =>
  createPrivateTool({
    id: "RUN_ACTOR_SYNC",
    description: "Run an actor synchronously and return dataset items",
    inputSchema: runActorInputSchema,
    outputSchema: runActorSyncOutputSchema,
    execute: async ({ context: ctx }: any) => {
      if (!ctx.actorId) {
        throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
      }

      const client = createApifyClient(env);
      const parsedInput = JSON.parse(ctx.input);

      // Estimate costs for pre-authorization
      const estimatedTimeout = ctx.timeout || 300; // Default 5 min
      const estimatedMemory = ctx.memory || 256; // Default 256MB
      const estimatedComputeUnits = Math.ceil(
        (estimatedTimeout * estimatedMemory) / 1000,
      );

      let transactionId: string | undefined;

      try {
        // PRÉ-AUTORIZA com estimativa
        const authResult = await (env as any).APIFY_CONTRACT.CONTRACT_AUTHORIZE(
          {
            clauses: [
              {
                clauseId: "apify:computeUnits",
                amount: estimatedComputeUnits,
              },
              {
                clauseId: "apify:memoryMB",
                amount: estimatedMemory,
              },
            ],
          },
        );
        transactionId = authResult.transactionId;

        // EXECUTA
        const startTime = Date.now();
        const items = await client.runActorSyncGetDatasetItems(
          ctx.actorId,
          parsedInput,
          {
            timeout: ctx.timeout,
            memory: ctx.memory,
            build: ctx.build,
          },
        );
        const executionTimeMs = Date.now() - startTime;

        // Calcula uso real com base na execução
        const actualTimeout = Math.ceil(executionTimeMs / 1000);
        const actualMemory = estimatedMemory; // Apify não retorna memory usado, usa estimativa
        const actualComputeUnits = Math.ceil(
          (actualTimeout * actualMemory) / 1000,
        );

        // SETTLEMENT com valores REAIS
        await (env as any).APIFY_CONTRACT.CONTRACT_SETTLE({
          transactionId,
          vendorId: (env as any).DECO_CHAT_WORKSPACE,
          clauses: [
            {
              clauseId: "apify:computeUnits",
              amount: Math.min(actualComputeUnits, estimatedComputeUnits),
            },
            {
              clauseId: "apify:memoryMB",
              amount: actualMemory,
            },
          ],
        });

        return { data: items };
      } catch (error) {
        try {
          // SETTLEMENT ZERO com o transactionId original em caso de erro
          if (transactionId) {
            await (env as any).APIFY_CONTRACT.CONTRACT_SETTLE({
              transactionId,
              vendorId: (env as any).DECO_CHAT_WORKSPACE,
              clauses: [
                {
                  clauseId: "apify:computeUnits",
                  amount: 0,
                },
                {
                  clauseId: "apify:memoryMB",
                  amount: 0,
                },
              ],
            });
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

/**
 * Create Run Actor Asynchronously Tool
 * With inline contract support and precise settlement
 */
export const createRunActorAsyncTool = (env: Env) =>
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

      const client = createApifyClient(env);
      const parsedInput = JSON.parse(ctx.input);

      // Estimate costs for pre-authorization (async runs may take longer)
      const estimatedTimeout = ctx.timeout || 3600; // Default 1 hour for async
      const estimatedMemory = ctx.memory || 256;
      const estimatedComputeUnits = Math.ceil(
        (estimatedTimeout * estimatedMemory) / 1000,
      );

      let transactionId: string | undefined;

      try {
        // PRÉ-AUTORIZA com estimativa
        const authResult = await (env as any).APIFY_CONTRACT.CONTRACT_AUTHORIZE(
          {
            clauses: [
              {
                clauseId: "apify:computeUnits",
                amount: estimatedComputeUnits,
              },
              {
                clauseId: "apify:memoryMB",
                amount: estimatedMemory,
              },
            ],
          },
        );
        transactionId = authResult.transactionId;

        // EXECUTA (retorna imediatamente)
        const result = await client.runActor(ctx.actorId, parsedInput, {
          timeout: ctx.timeout,
          memory: ctx.memory,
          build: ctx.build,
        });

        // Para async, não sabemos o tempo real até depois
        // Settlement é feito com estimativa (pode ser refinado com webhook)
        const actualComputeUnits = estimatedComputeUnits; // Estimativa temporária
        const actualMemory = estimatedMemory;

        // SETTLEMENT com estimativa (melhor seria usar webhooks)
        await (env as any).APIFY_CONTRACT.CONTRACT_SETTLE({
          transactionId,
          vendorId: (env as any).DECO_CHAT_WORKSPACE,
          clauses: [
            {
              clauseId: "apify:computeUnits",
              amount: actualComputeUnits,
            },
            {
              clauseId: "apify:memoryMB",
              amount: actualMemory,
            },
          ],
        });

        const runData = result.data as ActorRun;
        return {
          id: runData.id,
          status: runData.status,
          actorId: runData.actId || ctx.actorId,
        };
      } catch (error) {
        try {
          // SETTLEMENT ZERO com o transactionId original em caso de erro
          if (transactionId) {
            await (env as any).APIFY_CONTRACT.CONTRACT_SETTLE({
              transactionId,
              vendorId: (env as any).DECO_CHAT_WORKSPACE,
              clauses: [
                {
                  clauseId: "apify:computeUnits",
                  amount: 0,
                },
                {
                  clauseId: "apify:memoryMB",
                  amount: 0,
                },
              ],
            });
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

/**
 * Factory function to create all Apify tools
 * Takes env and returns tool instances with contract support
 */
export const createApifyTools = (env: Env) => [
  createListActorsTool(env),
  createGetActorTool(env),
  createListActorRunsTool(env),
  createGetActorRunTool(env),
  createRunActorSyncTool(env),
  createRunActorAsyncTool(env),
];

/**
 * Legacy export for compatibility
 */
export const apifyTools = [
  createListActorsTool,
  createGetActorTool,
  createListActorRunsTool,
  createGetActorRunTool,
  createRunActorSyncTool,
  createRunActorAsyncTool,
];
