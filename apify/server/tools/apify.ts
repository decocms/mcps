/**
 * Apify Tools
 *
 * Tools for running Apify actors and managing web scraping automations
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getApifyToken } from "../lib/env.ts";
import { ApifyClient } from "./utils/client.ts";
import type { ActorRun } from "./utils/types.ts";
import { APIFY_ERROR_MESSAGES } from "../constants.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const listActorsInputSchema = z.object({
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

const getActorInputSchema = z.object({
  actorId: z.string().describe("The ID or name of the actor"),
});

const listActorRunsInputSchema = z.object({
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

const getActorRunInputSchema = z.object({
  actorId: z.string().describe("The ID of the actor"),
  runId: z.string().describe("The ID of the actor run"),
  includeDatasetItems: z
    .boolean()
    .optional()
    .describe("If true, include dataset items in the response"),
});

const runActorInputSchema = z.object({
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

const runActorSyncOutputSchema = z.object({
  data: z.unknown().describe("Dataset items from the actor run"),
});

const runActorAsyncOutputSchema = z
  .object({
    id: z.string().describe("Run ID"),
    status: z.string().describe("Current status of the run"),
    actorId: z.string().describe("Actor ID"),
  })
  .passthrough();

// ============================================================================
// Tools
// ============================================================================

export const createListActorsTool = (env: Env) =>
  createPrivateTool({
    id: "list_actors",
    description: "List all actors accessible to the user",
    inputSchema: listActorsInputSchema,
    execute: async ({ context }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

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

export const createGetActorTool = (env: Env) =>
  createPrivateTool({
    id: "get_actor",
    description: "Get details of a specific actor",
    inputSchema: getActorInputSchema,
    execute: async ({ context }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

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

export const createListActorRunsTool = (env: Env) =>
  createPrivateTool({
    id: "list_actor_runs",
    description: "List runs of a specific actor",
    inputSchema: listActorRunsInputSchema,
    execute: async ({ context }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

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

export const createGetActorRunTool = (env: Env) =>
  createPrivateTool({
    id: "get_actor_run",
    description: "Get details of a specific actor run",
    inputSchema: getActorRunInputSchema,
    execute: async ({ context }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

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

export const createRunActorSyncTool = (env: Env) =>
  createPrivateTool({
    id: "run_actor_sync",
    description: "Run an actor synchronously and return dataset items",
    inputSchema: runActorInputSchema,
    outputSchema: runActorSyncOutputSchema,
    execute: async ({ context: ctx }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

      if (!ctx.actorId) {
        throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
      }

      const parsedInput = JSON.parse(ctx.input);

      try {
        const itemsResponse = await client.runActorSyncGetDatasetItems(
          ctx.actorId,
          parsedInput,
          {
            timeout: ctx.timeout,
            memory: ctx.memory,
            build: ctx.build,
          },
        );

        return itemsResponse;
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

export const createRunActorAsyncTool = (env: Env) =>
  createPrivateTool({
    id: "run_actor_async",
    description:
      "Run an actor asynchronously and return immediately without waiting for completion",
    inputSchema: runActorInputSchema,
    outputSchema: runActorAsyncOutputSchema,
    execute: async ({ context: ctx }) => {
      const token = getApifyToken(env);
      const client = new ApifyClient(token);

      if (!ctx.actorId) {
        throw new Error(APIFY_ERROR_MESSAGES.INVALID_ARGUMENT);
      }

      const parsedInput = JSON.parse(ctx.input);

      try {
        const result = await client.runActor(ctx.actorId, parsedInput, {
          timeout: ctx.timeout,
          memory: ctx.memory,
          build: ctx.build,
        });

        const runData = result.data as ActorRun;
        return {
          id: runData.id,
          status: runData.status,
          actorId: runData.actId || ctx.actorId,
        };
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : APIFY_ERROR_MESSAGES.FAILED_PRECONDITION,
        );
      }
    },
  });

// ============================================================================
// Export all apify tools
// ============================================================================

export const apifyTools = [
  createListActorsTool,
  createGetActorTool,
  createListActorRunsTool,
  createGetActorRunTool,
  createRunActorSyncTool,
  createRunActorAsyncTool,
];
