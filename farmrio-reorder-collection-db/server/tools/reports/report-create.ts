import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { ReportInsert } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  parseIsoDate,
  rankedListItemSchema,
  reportCriteriaSchema,
  reportMetricSchema,
  reportOutputSchema,
  serializeReport,
} from "../utils.ts";

const inputSchema = z
  .object({
    title: z.string().min(1),
    collectionId: z.union([z.string().min(1), z.number()]),
    summary: z.string().min(1),
    date: z.string(),
    criterios: z.array(reportCriteriaSchema),
    metricas: z.array(reportMetricSchema),
    rankedList: z.array(rankedListItemSchema),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    item: reportOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const reportCreateTool = (env: Env) =>
  createTool({
    id: "report_create",
    description: "Cria um novo report.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        const input = inputSchema.parse(context);
        const db = getDb(getDatabaseUrl(env)).db;

        const payload: ReportInsert = {
          title: input.title,
          collection_id: String(input.collectionId),
          summary: input.summary,
          date: parseIsoDate(input.date),
          criterios: input.criterios,
          metricas: input.metricas,
          ranked_list: input.rankedList,
        };

        const created = await db
          .insertInto("reports")
          .values(payload)
          .returningAll()
          .executeTakeFirst();

        if (!created) {
          return {
            success: false,
            error: "Failed to create report.",
          };
        }

        return {
          success: true,
          item: serializeReport(created),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
