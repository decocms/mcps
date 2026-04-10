import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { CollectionUpdate } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  collectionOutputSchema,
  getDatabaseUrl,
  serializeCollection,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    farmCollectionId: z.string().min(1),
    decoCollectionId: z.string().optional(),
    title: z.string().min(1).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.decoCollectionId !== undefined ||
      data.title !== undefined ||
      data.isEnabled !== undefined,
    { message: "At least one field to update is required." },
  );

const outputSchema = z
  .object({
    success: z.boolean(),
    item: collectionOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const collectionUpdateTool = (env: Env) =>
  createTool({
    id: "collection_update",
    description:
      "Atualiza uma collection existente pelo farm_collection_id (identificador VTEX/Farm).",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }, ctx) => {
      ensureAuthenticated(ctx!);
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const patch: CollectionUpdate = {};

        if (input.decoCollectionId !== undefined) {
          patch.deco_collection_id = input.decoCollectionId;
        }

        if (input.title !== undefined) {
          patch.title = input.title;
        }

        if (input.isEnabled !== undefined) {
          patch.is_enabled = input.isEnabled;
        }

        const updated = await db
          .updateTable("collection")
          .set(patch)
          .where("farm_collection_id", "=", input.farmCollectionId)
          .returningAll()
          .executeTakeFirst();

        if (!updated) {
          return {
            success: false,
            error: "Collection not found.",
          };
        }

        return {
          success: true,
          item: serializeCollection(updated),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
