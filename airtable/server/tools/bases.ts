import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";

export const createListBasesTool = (env: Env) =>
  createTool({
    id: "airtable_list_bases",
    description:
      "List all Airtable bases accessible to the authenticated user. Supports pagination via offset.",
    inputSchema: z.object({
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.listBases(context.offset);
    },
  });

export const createGetBaseSchemaTool = (env: Env) =>
  createTool({
    id: "airtable_get_base_schema",
    description: "Get the schema (tables, fields, views) of an Airtable base.",
    inputSchema: z.object({
      baseId: z
        .string()
        .describe("The ID of the base (e.g., appXXXXXXXXXXXXXX)."),
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.getBaseSchema(context.baseId, context.offset);
    },
  });
