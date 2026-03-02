import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import { getDb } from "../../database/index.ts";
import type { Env } from "../../types/env.ts";
import {
  getDatabaseUrl,
  reportSectionOutputSchema,
  sectionInputSchema,
  serializeSection,
  validateToken,
} from "../utils.ts";

const inputSchema = z
  .object({
    reportId: z.number().int().positive(),
    sections: z.array(sectionInputSchema),
  })
  .strict();

const outputSchema = z
  .object({
    success: z.boolean(),
    sections: z.array(reportSectionOutputSchema).optional(),
    error: z.string().optional(),
  })
  .strict();

export const reportSectionSaveTool = (env: Env) =>
  createPrivateTool({
    id: "report_section_save",
    description:
      "Substitui todas as seções de um report. Apaga as seções existentes e insere as novas com seus itens (criteria, metrics, ranked-list ou note).",
    inputSchema,
    outputSchema,
    execute: async ({ context }: { context: unknown }) => {
      try {
        validateToken(env);
        const input = inputSchema.parse(context);
        const { db } = await getDb(getDatabaseUrl(env));

        const savedSections = await db.transaction().execute(async (trx) => {
          // Buscar seções existentes para deletar os itens primeiro (sem CASCADE no schema)
          const existingSections = await trx
            .selectFrom("report_section")
            .where("report_id", "=", input.reportId)
            .select("id")
            .execute();

          const existingIds = existingSections.map((s) => s.id);

          if (existingIds.length > 0) {
            await Promise.all([
              trx
                .deleteFrom("section_criteria_item")
                .where("section_id", "in", existingIds)
                .execute(),
              trx
                .deleteFrom("section_metric_item")
                .where("section_id", "in", existingIds)
                .execute(),
              trx
                .deleteFrom("section_ranked_item")
                .where("section_id", "in", existingIds)
                .execute(),
            ]);

            await trx
              .deleteFrom("report_section")
              .where("report_id", "=", input.reportId)
              .execute();
          }

          const result = [];

          for (const section of input.sections) {
            const insertedSection = await trx
              .insertInto("report_section")
              .values({
                report_id: input.reportId,
                type: section.type,
                title: section.title ?? null,
                content:
                  section.type === "note"
                    ? section.content
                    : (section.content ?? null),
                position: section.position,
              })
              .returningAll()
              .executeTakeFirst();

            if (!insertedSection) {
              throw new Error("Failed to insert section.");
            }

            const sectionId = insertedSection.id;

            if (section.type === "criteria" && section.items.length > 0) {
              await trx
                .insertInto("section_criteria_item")
                .values(
                  section.items.map((item) => ({
                    section_id: sectionId,
                    label: item.label,
                    description: item.description ?? null,
                  })),
                )
                .execute();
            }

            if (section.type === "metrics" && section.items.length > 0) {
              await trx
                .insertInto("section_metric_item")
                .values(
                  section.items.map((item) => ({
                    section_id: sectionId,
                    label: item.label,
                    value: item.value,
                    unit: item.unit ?? null,
                    status: item.status,
                  })),
                )
                .execute();
            }

            if (section.type === "ranked-list" && section.items.length > 0) {
              await trx
                .insertInto("section_ranked_item")
                .values(
                  section.items.map((item) => ({
                    section_id: sectionId,
                    position: item.position,
                    delta: item.delta,
                    label: item.label,
                    product_id: item.productId ?? null,
                    image: item.image ?? null,
                    value_select_rate: item.valueSelectRate ?? null,
                    value_availability: item.valueAvailability ?? null,
                    sessions: item.sessions ?? null,
                    select_rate: item.selectRate ?? null,
                    add_to_cart_rate: item.addToCartRate ?? null,
                    purchase_rate: item.purchaseRate ?? null,
                  })),
                )
                .execute();
            }

            result.push(insertedSection);
          }

          return result;
        });

        // Buscar itens das seções salvas para serializar corretamente
        const sectionIds = savedSections.map((s) => s.id);

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

        return {
          success: true,
          sections: savedSections.map((section) =>
            serializeSection(
              section,
              criteriaItems.filter((i) => i.section_id === section.id),
              metricItems.filter((i) => i.section_id === section.id),
              rankedItems.filter((i) => i.section_id === section.id),
            ),
          ),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
