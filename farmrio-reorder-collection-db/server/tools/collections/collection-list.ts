import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  collectionOutputSchema,
  getDatabaseUrl,
  serializeCollection,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    limit: z.number().int().positive().max(200).default(50),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    total: z.number().int().nonnegative().optional(),
    items: z.array(collectionOutputSchema).optional(),
    error: z.string().optional(),
  })
  .strict();

export const collectionListTool = (env: Env) =>
  createTool({
    id: "collection_list",
    description: "Lista collections com filtros opcionais.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }, ctx) => {
      ensureAuthenticated(ctx!);
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        let baseQuery = db.selectFrom("collection");
        if (input.isEnabled !== undefined) {
          baseQuery = baseQuery.where("is_enabled", "=", input.isEnabled);
        }

        const [rows, countRow] = await Promise.all([
          baseQuery
            .selectAll()
            .orderBy("id", "asc")
            .limit(input.limit)
            .offset(input.offset)
            .execute(),
          baseQuery
            .select((expressionBuilder) =>
              expressionBuilder.fn.countAll<number>().as("count"),
            )
            .executeTakeFirst(),
        ]);

        return {
          success: true,
          total: Number(countRow?.count ?? 0),
          items: rows.map(serializeCollection),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
