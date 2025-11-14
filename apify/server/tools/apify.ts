import { createPrivateTool } from "@decocms/runtime/mastra";
import { createApifyClient } from "./utils/client";
import type { ActorRun } from "./utils/types";
import { z } from "zod";

/**
 * Tool schemas
 */
const listActorsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
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
 * Helper function to get token from environment
 */
function getApifyToken(): string {
  // Try to get from environment (works in both Node and Cloudflare Workers)
  const token = process?.env?.APIFY_TOKEN || (globalThis as any).APIFY_TOKEN;

  if (!token) {
    throw new Error(
      "Apify token not configured. Set APIFY_TOKEN in .dev.vars file or environment variable.",
    );
  }
  return token;
}

/**
 * Create List Actors Tool
 */
export const createListActorsTool = () =>
  createPrivateTool({
    id: "LIST_ACTORS",
    description: "List all actors accessible to the user",
    inputSchema: listActorsSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        const client = createApifyClient(token);
        return await client.listActors({
          limit: (context as any).limit,
          offset: (context as any).offset,
          my: (context as any).my,
          desc: (context as any).desc,
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
export const createGetActorTool = () =>
  createPrivateTool({
    id: "GET_ACTOR",
    description: "Get details of a specific actor",
    inputSchema: getActorSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        if (!(context as any).actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(token);
        return await client.getActor((context as any).actorId);
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
export const createListActorRunsTool = () =>
  createPrivateTool({
    id: "LIST_ACTOR_RUNS",
    description: "List runs of a specific actor",
    inputSchema: listActorRunsSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        if (!(context as any).actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(token);
        return await client.getActorRuns((context as any).actorId, {
          limit: (context as any).limit,
          offset: (context as any).offset,
          status: (context as any).status,
          desc: (context as any).desc,
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
export const createGetActorRunTool = () =>
  createPrivateTool({
    id: "GET_ACTOR_RUN",
    description: "Get details of a specific actor run",
    inputSchema: getActorRunSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        const ctx = context as any;
        if (!ctx.actorId || !ctx.runId) {
          throw new Error("Actor ID and Run ID are required");
        }
        const client = createApifyClient(token);
        const result = await client.getActorRun(ctx.actorId, ctx.runId);

        if (ctx.includeDatasetItems && result.defaultDatasetId) {
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
 */
export const createRunActorSyncTool = () =>
  createPrivateTool({
    id: "RUN_ACTOR_SYNC",
    description: "Run an actor synchronously and return dataset items",
    inputSchema: runActorSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        const ctx = context as any;
        if (!ctx.actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(token);
        const parsedInput = JSON.parse(ctx.input);
        return await client.runActorSyncGetDatasetItems(
          ctx.actorId,
          parsedInput,
          {
            timeout: ctx.timeout,
            memory: ctx.memory,
            build: ctx.build,
          },
        );
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to run actor",
        );
      }
    },
  });

/**
 * Create Run Actor Asynchronously Tool
 */
export const createRunActorAsyncTool = () =>
  createPrivateTool({
    id: "RUN_ACTOR_ASYNC",
    description:
      "Run an actor asynchronously and return immediately without waiting for completion",
    inputSchema: runActorSchema,
    execute: async ({ context }) => {
      try {
        const token = getApifyToken();
        const ctx = context as any;
        if (!ctx.actorId) {
          throw new Error("Actor ID is required");
        }
        const client = createApifyClient(token);
        const parsedInput = JSON.parse(ctx.input);
        const result = await client.runActor(ctx.actorId, parsedInput, {
          timeout: ctx.timeout,
          memory: ctx.memory,
          build: ctx.build,
        });

        return result.data as ActorRun;
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to start actor run",
        );
      }
    },
  });

/**
 * Export all Apify tools
 */
export const apifyTools = [
  createListActorsTool,
  createGetActorTool,
  createListActorRunsTool,
  createGetActorRunTool,
  createRunActorSyncTool,
  createRunActorAsyncTool,
];
