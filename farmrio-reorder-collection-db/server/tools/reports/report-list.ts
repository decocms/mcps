import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportOutputSchema,
  serializeReport,
  validateToken,
} from "../utils.ts";

const inputSchema = z

  .object({
    collectionId: z.number().int().positive().optional(),
    category: z.string().optional(),
    status: z.enum(["passing", "failing", "warning"]).optional(),
    limit: z.number().int().positive().max(200).default(20),
    offset: z.number().int().nonnegative().default(0),
  })

  .strict();

const outputSchema = z

  .object({
    success: z.boolean(),
    total: z.number().int().nonnegative().optional(),
    items: z.array(reportOutputSchema).optional(),
    error: z.string().optional(),
  })

  .strict();

export const reportListTool = (env: Env) =>
  createPrivateTool({
    id: "report_list",
    description: "Lista reports com filtros opcionais.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        let baseQuery = db.selectFrom("report");

        if (input.collectionId !== undefined) {
          baseQuery = baseQuery.where("collection_id", "=", input.collectionId);
        }

        if (input.category !== undefined) {
          baseQuery = baseQuery.where("category", "=", input.category);
        }

        if (input.status !== undefined) {
          baseQuery = baseQuery.where("status", "=", input.status);
        }

        const [rows, countRow] = await Promise.all([
          baseQuery

            .selectAll()

            .orderBy("updated_at", "desc")

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
          items: rows.map(serializeReport),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
