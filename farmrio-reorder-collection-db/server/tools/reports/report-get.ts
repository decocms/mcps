import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportOutputSchema,
  serializeReport,
} from "../utils.ts";

const inputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    item: reportOutputSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const reportGetTool = (env: Env) =>
  createTool({
    id: "report_get",
    description: "Busca um report por id.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        const input = inputSchema.parse(context);
        const db = getDb(getDatabaseUrl(env)).db;
        const row = await db
          .selectFrom("reports")
          .where("id", "=", input.id)
          .selectAll()
          .executeTakeFirst();

        if (!row) {
          return {
            success: false,
            error: "Report not found.",
          };
        }

        return {
          success: true,
          item: serializeReport(row),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
