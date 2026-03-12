import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportWithSectionsOutputSchema,
  serializeReport,
  serializeSection,
  validateToken,
} from "../utils.ts";

const inputSchema = z

  .object({
    id: z.number().int().positive(),
  })

  .strict();

const outputSchema = z

  .object({
    success: z.boolean(),
    item: reportWithSectionsOutputSchema.optional(),
    error: z.string().optional(),
  })

  .strict();

export const reportGetTool = (env: Env) =>
  createPrivateTool({
    id: "report_get",
    description:
      "Busca um report por id, incluindo todas as seções e seus itens.",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const db = (await getDb(getDatabaseUrl(env))).db;

        const row = await db

          .selectFrom("report")

          .where("id", "=", input.id)

          .selectAll()

          .executeTakeFirst();

        if (!row) {
          return {
            success: false,
            error: "Report not found.",
          };
        }

        const sections = await db

          .selectFrom("report_section")

          .where("report_id", "=", row.id)

          .selectAll()

          .orderBy("position", "asc")

          .execute();

        const sectionIds = sections.map((s) => s.id);

        const [criteriaItems, metricItems, rankedItems] =
          sectionIds.length > 0
            ? await Promise.all([
                db

                  .selectFrom("section_criteria_item")

                  .where("section_id", "in", sectionIds)

                  .selectAll()

                  .execute(),
                db

                  .selectFrom("section_metric_item")

                  .where("section_id", "in", sectionIds)

                  .selectAll()

                  .execute(),
                db

                  .selectFrom("section_ranked_item")

                  .where("section_id", "in", sectionIds)

                  .selectAll()

                  .orderBy("position", "asc")

                  .execute(),
              ])
            : [[], [], []];

        const serializedSections = sections.map((section) =>
          serializeSection(
            section,
            criteriaItems.filter((i) => i.section_id === section.id),
            metricItems.filter((i) => i.section_id === section.id),
            rankedItems.filter((i) => i.section_id === section.id),
          ),
        );

        return {
          success: true,
          item: {
            ...serializeReport(row),
            sections: serializedSections,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
