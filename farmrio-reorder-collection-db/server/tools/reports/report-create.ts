import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { ReportInsert } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportOutputSchema,
  serializeReport,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    collectionId: z.number().int().positive(),
    title: z.string().min(1),
    category: z.string().min(1),
    status: z.enum(["passing", "failing", "warning"]),
    summary: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
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
  createPrivateTool({
    id: "report_create",
    description:
      "Cria um novo report. Use report_section_save para adicionar seções após criar o report.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const payload: ReportInsert = {
          collection_id: input.collectionId,
          title: input.title,
          category: input.category,
          status: input.status,
          summary: input.summary ?? null,
          source: input.source ?? null,
          tags: input.tags ?? null,
          updated_at: new Date(),
        };

        const created = await db
          .insertInto("report")
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
