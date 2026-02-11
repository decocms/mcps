import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const createCollection = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_COLLECTION",
    description:
      "Create a new collection in the catalog. Collections can be Manual, Automatic, or Hybrid.",
    inputSchema: z.object({
      Name: z.string().describe("Collection name"),
      Description: z
        .string()
        .optional()
        .describe("Collection description for internal use"),
      Searchable: z
        .boolean()
        .optional()
        .describe("Whether the collection is searchable in the store"),
      Highlight: z
        .boolean()
        .optional()
        .describe("Whether to highlight specific products using a tag"),
      DateFrom: z
        .string()
        .describe(
          "Collection start date and time (ISO 8601 format, e.g., 2024-01-01T00:00:00)",
        ),
      DateTo: z
        .string()
        .describe(
          "Collection end date and time (ISO 8601 format, e.g., 2025-12-31T23:59:59)",
        ),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.createCollection(context);
    },
  });
