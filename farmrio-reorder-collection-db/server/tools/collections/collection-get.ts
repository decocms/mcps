import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  collectionOutputSchema,
  getDatabaseUrl,
  serializeCollection,
} from "../utils.ts";

const inputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    item: collectionOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const collectionGetTool = (env: Env) =>
  createPrivateTool({
    id: "collection_get",
    description: "Busca uma collection por id.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const row = await db
          .selectFrom("collections")
          .where("id", "=", input.id)
          .selectAll()
          .executeTakeFirst();

        if (!row) {
          return {
            success: false,
            error: "Collection not found.",
          };
        }

        return {
          success: true,
          item: serializeCollection(row),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
