import type { Env } from "server/main";
import {
  createApifyClient,
} from "./utils/client";
import type { ActorRun } from "./utils/types";
import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { createApifyRunToolWithContract } from "./generator";

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
 * Follows Sora pattern: client is created with env in closure
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
 * With contract support for billing
 */
export const createRunActorSyncTool = (env: Env) =>
  createApifyRunToolWithContract(
    "RUN_ACTOR_SYNC",
    "Run an actor synchronously and return dataset items",
    runActorSchema,
    {
      execute: async ({ env, context: ctx }) => {
        if (!ctx.actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(env);
        const parsedInput = JSON.parse(ctx.input);
        const items = await client.runActorSyncGetDatasetItems(
          ctx.actorId,
          parsedInput,
          {
            timeout: ctx.timeout,
            memory: ctx.memory,
            build: ctx.build,
          },
        );
        return { items };
      },
      getMaxCost: async () => {
        // Default: 1 micro dollar per execution
        // Could be fetched from Apify API based on actor memory/timeout
        return 1;
      },
      getContract: (env: any) => ({
        binding: env.APIFY_CONTRACT,
        clause: {
          clauseId: "apify:runActorSync",
          amount: 1,
        },
      }),
    },
  )(env);

/**
 * Create Run Actor Asynchronously Tool
 * With contract support for billing
 */
export const createRunActorAsyncTool = (env: Env) =>
  createApifyRunToolWithContract(
    "RUN_ACTOR_ASYNC",
    "Run an actor asynchronously and return immediately without waiting for completion",
    runActorSchema,
    {
      execute: async ({ env, context: ctx }) => {
        if (!ctx.actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(env);
        const parsedInput = JSON.parse(ctx.input);
        const result = await client.runActor(ctx.actorId, parsedInput, {
          timeout: ctx.timeout,
          memory: ctx.memory,
          build: ctx.build,
        });

        return result.data as ActorRun;
      },
      getMaxCost: async () => {
        // Default: 1 micro dollar per execution
        // Could be fetched from Apify API based on actor memory/timeout
        return 1;
      },
      getContract: (env: any) => ({
        binding: env.APIFY_CONTRACT,
        clause: {
          clauseId: "apify:runActorAsync",
          amount: 1,
        },
      }),
    },
  )(env);

/**
 * Factory function to create all Apify tools
 * Takes env and returns tool instances with client captured in closure
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
 * Legacy export for compatibility - tools as creators
 */
export const apifyTools = [
  createListActorsTool,
  createGetActorTool,
  createListActorRunsTool,
  createGetActorRunTool,
  createRunActorSyncTool,
  createRunActorAsyncTool,
];
