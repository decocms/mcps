import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { ReportUpdate } from "../../database/schema.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportOutputSchema,
  serializeReport,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    status: z.enum(["passing", "failing", "warning"]).optional(),
    summary: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.category !== undefined ||
      data.status !== undefined ||
      data.summary !== undefined ||
      data.source !== undefined ||
      data.tags !== undefined,
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
    description: "Atualiza campos de um report existente.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const patch: ReportUpdate = {
          updated_at: new Date(),
        };

        if (input.title !== undefined) {
          patch.title = input.title;
        }

        if (input.category !== undefined) {
          patch.category = input.category;
        }

        if (input.status !== undefined) {
          patch.status = input.status;
        }

        if (input.summary !== undefined) {
          patch.summary = input.summary;
        }

        if (input.source !== undefined) {
          patch.source = input.source;
        }

        if (input.tags !== undefined) {
          patch.tags = input.tags;
        }

        const updated = await db
          .updateTable("report")
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
