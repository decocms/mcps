import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  parseCollectionIdInput,
  parseIsoDate,
  reportOutputSchema,
  serializeReport,
} from "../utils.ts";

const inputSchema = z
  .object({
    collectionId: z.union([z.string().min(1), z.number()]).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
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
  createTool({
    id: "report_list",
    description: "Lista reports com filtros opcionais.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        const input = inputSchema.parse(context);
        const db = getDb(getDatabaseUrl(env)).db;

        let baseQuery = db.selectFrom("reports");

        if (input.collectionId !== undefined) {
          baseQuery = baseQuery.where(
            "collection_id",
            "=",
            parseCollectionIdInput(input.collectionId),
          );
        }

        if (input.dateFrom) {
          baseQuery = baseQuery.where(
            "date",
            ">=",
            parseIsoDate(input.dateFrom),
          );
        }

        if (input.dateTo) {
          baseQuery = baseQuery.where("date", "<=", parseIsoDate(input.dateTo));
        }

        const [rows, countRow] = await Promise.all([
          baseQuery
            .selectAll()
            .orderBy("date", "desc")
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
