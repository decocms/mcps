import { createPrivateTool } from "@decocms/runtime/tools";
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
    id: z.string().uuid(),
    collectionId: z.number().int().optional(),
    nome: z.string().min(1).optional(),
    isEnable: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.collectionId !== undefined ||
      data.nome !== undefined ||
      data.isEnable !== undefined,
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
  createPrivateTool({
    id: "collection_update",
    description: "Atualiza uma collection existente.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const patch: CollectionUpdate = {
          updated_at: new Date(),
        };

        if (input.collectionId !== undefined) {
          patch.collection_id = input.collectionId;
        }

        if (input.nome !== undefined) {
          patch.nome = input.nome;
        }

        if (input.isEnable !== undefined) {
          patch.is_enable = input.isEnable;
        }

        const updated = await db
          .updateTable("collections")
          .set(patch)
          .where("id", "=", input.id)
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
