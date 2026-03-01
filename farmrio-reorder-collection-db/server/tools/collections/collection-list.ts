import { createPrivateTool } from "@decocms/runtime/tools";
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
    isEnable: z.boolean().optional(),
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
  createPrivateTool({
    id: "collection_list",
    description: "Lista collections com filtros opcionais.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        let baseQuery = db.selectFrom("collections");
        if (input.isEnable !== undefined) {
          baseQuery = baseQuery.where("is_enable", "=", input.isEnable);
        }

        const [rows, countRow] = await Promise.all([
          baseQuery
            .selectAll()
            .orderBy("created_at", "desc")
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
