import type { Env } from "server/main";
import {
  createApifyClient,
} from "./utils/client";
import type { ActorRun } from "./utils/types";
import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/mastra";

/**
 * Tool schemas
 */
const listActorsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of actors to return (default: 10)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of actors to skip (default: 0)"),
  my: z
    .boolean()
    .optional()
    .describe("If true, only return actors owned by the user"),
  desc: z
    .boolean()
    .optional()
    .describe("If true, sort results in descending order by creation date"),
});

const getActorSchema = z.object({
  actorId: z.string().describe("The ID or name of the actor"),
});

const listActorRunsSchema = z.object({
  actorId: z.string().describe("The ID of the actor"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of runs to return (default: 10)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of runs to skip (default: 0)"),
  status: z
    .string()
    .optional()
    .describe(
      "Filter runs by status (READY, RUNNING, SUCCEEDED, FAILED, etc.)",
    ),
  desc: z
    .boolean()
    .optional()
    .describe("If true, sort results in descending order by creation date"),
});

const getActorRunSchema = z.object({
  actorId: z.string().describe("The ID of the actor"),
  runId: z.string().describe("The ID of the actor run"),
  includeDatasetItems: z
    .boolean()
    .optional()
    .describe("If true, include dataset items in the response"),
});

const runActorSchema = z.object({
  actorId: z.string().describe("The ID of the actor to run"),
  input: z
    .string()
    .describe("Input data for the actor run (Stringified JSON object)"),
  timeout: z
    .number()
    .int()
    .optional()
    .describe("Maximum timeout for the run in seconds"),
  memory: z
    .number()
    .int()
    .optional()
    .describe("Amount of memory allocated for the run in megabytes"),
  build: z
    .string()
    .optional()
    .describe("Specific build version to use (optional)"),
});

/**
 * Create List Actors Tool
 */
export const createListActorsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_ACTORS",
    description: "List all actors accessible to the user",
    inputSchema: listActorsSchema,
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
          error instanceof Error ? error.message : "Failed to list actors",
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
    inputSchema: getActorSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(env);
        return await client.getActor(context.actorId);
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to get actor",
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
    inputSchema: listActorRunsSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId) {
          throw new Error("Actor ID is required");
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
          error instanceof Error ? error.message : "Failed to list actor runs",
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
    inputSchema: getActorRunSchema,
    execute: async ({ context }: any) => {
      try {
        if (!context.actorId || !context.runId) {
          throw new Error("Actor ID and Run ID are required");
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
          error instanceof Error ? error.message : "Failed to get actor run",
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
    inputSchema: runActorSchema,
    execute: async ({ context: ctx }: any) => {
      if (!ctx.actorId) {
        throw new Error("Actor ID is required");
      }

      const client = createApifyClient(env);
      const parsedInput = JSON.parse(ctx.input);

      // Estimate costs for pre-authorization
      const estimatedTimeout = ctx.timeout || 300; // Default 5 min
      const estimatedMemory = ctx.memory || 256; // Default 256MB
      const estimatedComputeUnits = Math.ceil((estimatedTimeout * estimatedMemory) / 1000);

      try {
        // PRÉ-AUTORIZA com estimativa
        const { transactionId } = await (env as any).APIFY_CONTRACT
          .CONTRACT_AUTHORIZE({
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
          });

        // EXECUTA
        const startTime = Date.now();
        const result = await client.runActorSyncGetDatasetItems(
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
        const actualComputeUnits = Math.ceil((actualTimeout * actualMemory) / 1000);

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

        return result;
      } catch (error) {
        try {
          // SETTLEMENT ZERO em caso de erro
          const { transactionId } = await (env as any).APIFY_CONTRACT
            .CONTRACT_AUTHORIZE({
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
            });

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
        } catch (settleError) {
          console.error("Failed to settle contract on error:", settleError);
        }

        throw new Error(
          error instanceof Error ? error.message : "Failed to run actor",
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
    inputSchema: runActorSchema,
    execute: async ({ context: ctx }: any) => {
      if (!ctx.actorId) {
        throw new Error("Actor ID is required");
      }

      const client = createApifyClient(env);
      const parsedInput = JSON.parse(ctx.input);

      // Estimate costs for pre-authorization (async runs may take longer)
      const estimatedTimeout = ctx.timeout || 3600; // Default 1 hour for async
      const estimatedMemory = ctx.memory || 256;
      const estimatedComputeUnits = Math.ceil((estimatedTimeout * estimatedMemory) / 1000);

      try {
        // PRÉ-AUTORIZA com estimativa
        const { transactionId } = await (env as any).APIFY_CONTRACT
          .CONTRACT_AUTHORIZE({
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
          });

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

        return result.data as ActorRun;
      } catch (error) {
        try {
          // SETTLEMENT ZERO em caso de erro
          const { transactionId } = await (env as any).APIFY_CONTRACT
            .CONTRACT_AUTHORIZE({
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
            });

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
        } catch (settleError) {
          console.error("Failed to settle contract on error:", settleError);
        }

        throw new Error(
          error instanceof Error ? error.message : "Failed to start actor run",
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
