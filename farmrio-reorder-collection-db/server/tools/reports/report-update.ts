import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { ReportUpdate } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  parseCollectionIdInput,
  parseIsoDate,
  rankedListItemSchema,
  reportCriteriaSchema,
  reportMetricSchema,
  reportOutputSchema,
  serializeReport,
} from "../utils.ts";

const inputSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).optional(),
    collectionId: z.union([z.string().min(1), z.number()]).optional(),
    summary: z.string().min(1).optional(),
    date: z.string().optional(),
    criterios: z.array(reportCriteriaSchema).optional(),
    metricas: z.array(reportMetricSchema).optional(),
    rankedList: z.array(rankedListItemSchema).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.collectionId !== undefined ||
      data.summary !== undefined ||
      data.date !== undefined ||
      data.criterios !== undefined ||
      data.metricas !== undefined ||
      data.rankedList !== undefined,
    { message: "At least one field to update is required." },
  );

const outputSchema = z
  .object({
    success: z.boolean(),
    item: reportOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const reportUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "report_update",
    description: "Atualiza um report existente.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const patch: ReportUpdate = {
          updated_at: new Date(),
        };

        if (input.title !== undefined) {
          patch.title = input.title;
        }

        if (input.collectionId !== undefined) {
          patch.collection_id = parseCollectionIdInput(input.collectionId);
        }

        if (input.summary !== undefined) {
          patch.summary = input.summary;
        }

        if (input.date !== undefined) {
          patch.date = parseIsoDate(input.date);
        }

        if (input.criterios !== undefined) {
          patch.criterios = input.criterios;
        }

        if (input.metricas !== undefined) {
          patch.metricas = input.metricas;
        }

        if (input.rankedList !== undefined) {
          patch.ranked_list = input.rankedList;
        }

        const updated = await db
          .updateTable("reports")
          .set(patch)
          .where("id", "=", input.id)
          .returningAll()
          .executeTakeFirst();

        if (!updated) {
          return {
            success: false,
            error: "Report not found.",
          };
        }

        return {
          success: true,
          item: serializeReport(updated),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
