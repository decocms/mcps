import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { CollectionInsert } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  collectionOutputSchema,
  getDatabaseUrl,
  serializeCollection,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    collectionId: z.number().int(),
    nome: z.string().min(1),
    isEnable: z.boolean().default(true),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    item: collectionOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const collectionCreateTool = (env: Env) =>
  createPrivateTool({
    id: "collection_create",
    description: "Cria uma nova collection.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const payload: CollectionInsert = {
          collection_id: input.collectionId,
          nome: input.nome,
          is_enable: input.isEnable,
        };

        const created = await db
          .insertInto("collections")
          .values(payload)
          .returningAll()
          .executeTakeFirst();

        if (!created) {
          return {
            success: false,
            error: "Failed to create collection.",
          };
        }

        return {
          success: true,
          item: serializeCollection(created),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
