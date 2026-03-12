import z from "zod";
import type { Env } from "../types/env.ts";
import type {
  CollectionRow,
  ReportRow,
  ReportSectionRow,
  SectionCriteriaItemRow,
  SectionMetricItemRow,
  SectionRankedItemRow,
} from "../database/schema.ts";

// ─── Schemas de input para seções ────────────────────────────────────────────

export const sectionCriteriaItemInputSchema = z

  .object({
    label: z.string().min(1),
    description: z.string().optional(),
  })

  .strict();

export const sectionMetricItemInputSchema = z

  .object({
    label: z.string().min(1),
    value: z.number(),
    unit: z.string().optional(),
    status: z.enum(["info", "warning", "error", "success"]),
  })

  .strict();

export const sectionRankedItemInputSchema = z

  .object({
    position: z.number().int().positive(),
    delta: z.number().int(),
    label: z.string().min(1),
    productId: z.string().min(1).optional(),
    image: z.string().optional(),
    valueSelectRate: z.string().optional(),
    valueAvailability: z.string().optional(),
    sessions: z.number().int().optional(),
    selectRate: z.number().optional(),
    addToCartRate: z.number().optional(),
    purchaseRate: z.number().optional(),
  })

  .strict();

export const sectionInputSchema = z.discriminatedUnion("type", [
  z

    .object({
      type: z.literal("criteria"),
      title: z.string().optional(),
      content: z.string().optional(),
      position: z.number().int().positive(),
      items: z.array(sectionCriteriaItemInputSchema),
    })

    .strict(),
  z

    .object({
      type: z.literal("metrics"),
      title: z.string().optional(),
      content: z.string().optional(),
      position: z.number().int().positive(),
      items: z.array(sectionMetricItemInputSchema),
    })

    .strict(),
  z

    .object({
      type: z.literal("note"),
      title: z.string().optional(),
      content: z.string().min(1),
      position: z.number().int().positive(),
    })

    .strict(),
  z

    .object({
      type: z.literal("ranked-list"),
      title: z.string().optional(),
      content: z.string().optional(),
      position: z.number().int().positive(),
      items: z.array(sectionRankedItemInputSchema),
    })

    .strict(),
]);

// ─── Schemas de output ────────────────────────────────────────────────────────

export const sectionCriteriaItemOutputSchema = z

  .object({
    id: z.number().int(),
    label: z.string(),
    description: z.string().nullable(),
  })

  .strict();

export const sectionMetricItemOutputSchema = z

  .object({
    id: z.number().int(),
    label: z.string(),
    value: z.number(),
    unit: z.string().nullable(),
    status: z.enum(["info", "warning", "error", "success"]),
  })

  .strict();

export const sectionRankedItemOutputSchema = z

  .object({
    id: z.number().int(),
    position: z.number().int(),
    delta: z.number().int(),
    label: z.string(),
    productId: z.string().nullable(),
    image: z.string().nullable(),
    valueSelectRate: z.string().nullable(),
    valueAvailability: z.string().nullable(),
    sessions: z.number().int().nullable(),
    selectRate: z.number().nullable(),
    addToCartRate: z.number().nullable(),
    purchaseRate: z.number().nullable(),
  })

  .strict();

export const reportSectionOutputSchema = z.object({
  id: z.number().int(),
  reportId: z.number().int(),
  type: z.enum(["metrics", "criteria", "note", "ranked-list"]),
  title: z.string().nullable(),
  content: z.string().nullable(),
  position: z.number().int(),
  criteriaItems: z.array(sectionCriteriaItemOutputSchema).optional(),
  metricItems: z.array(sectionMetricItemOutputSchema).optional(),
  rankedItems: z.array(sectionRankedItemOutputSchema).optional(),
});

export const reportOutputSchema = z

  .object({
    id: z.number().int(),
    collectionId: z.number().int(),
    title: z.string(),
    category: z.string(),
    status: z.enum(["passing", "failing", "warning"]),
    summary: z.string().nullable(),
    source: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    updatedAt: z.string(),
  })

  .strict();

export const reportWithSectionsOutputSchema = reportOutputSchema

  .omit({})

  .extend({
    sections: z.array(reportSectionOutputSchema),
  });

export const collectionOutputSchema = z

  .object({
    id: z.number().int(),
    farmCollectionId: z.string(),
    decoCollectionId: z.string().nullable(),
    title: z.string(),
    isEnabled: z.boolean(),
  })

  .strict();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function validateToken(env: Env): void {
  const expectedToken = process.env.MCP_ACCESS_TOKEN;
  if (!expectedToken) {
    throw new Error("MCP_ACCESS_TOKEN not configured on server.");
  }

  const providedToken = env.MESH_REQUEST_CONTEXT.state.MCP_ACCESS_TOKEN;
  if (providedToken !== expectedToken) {
    throw new Error("Unauthorized: invalid MCP_ACCESS_TOKEN.");
  }
}

export function getDatabaseUrl(_env: Env): string {
  const databaseUrl = process.env.INTERNAL_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("INTERNAL_DATABASE_URL not configured.");
  }

  return databaseUrl;
}

function dateToIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeCollection(row: CollectionRow) {
  return {
    id: row.id,
    farmCollectionId: row.farm_collection_id,
    decoCollectionId: row.deco_collection_id ?? null,
    title: row.title,
    isEnabled: row.is_enabled,
  };
}

export function serializeReport(row: ReportRow) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    title: row.title,
    category: row.category,
    status: row.status,
    summary: row.summary ?? null,
    source: row.source ?? null,
    tags: row.tags ?? null,
    updatedAt: dateToIso(row.updated_at),
  };
}

export function serializeSectionCriteriaItem(row: SectionCriteriaItemRow) {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? null,
  };
}

export function serializeSectionMetricItem(row: SectionMetricItemRow) {
  return {
    id: row.id,
    label: row.label,
    value: Number(row.value),
    unit: row.unit ?? null,
    status: row.status,
  };
}

export function serializeSectionRankedItem(row: SectionRankedItemRow) {
  return {
    id: row.id,
    position: row.position,
    delta: row.delta,
    label: row.label,
    productId: row.product_id ?? null,
    image: row.image ?? null,
    valueSelectRate: row.value_select_rate ?? null,
    valueAvailability: row.value_availability ?? null,
    sessions: row.sessions ?? null,
    selectRate: row.select_rate != null ? Number(row.select_rate) : null,
    addToCartRate:
      row.add_to_cart_rate != null ? Number(row.add_to_cart_rate) : null,
    purchaseRate: row.purchase_rate != null ? Number(row.purchase_rate) : null,
  };
}

export function serializeSection(
  row: ReportSectionRow,
  criteriaItems: SectionCriteriaItemRow[],
  metricItems: SectionMetricItemRow[],
  rankedItems: SectionRankedItemRow[],
) {
  const base = {
    id: row.id,
    reportId: row.report_id,
    type: row.type,
    title: row.title ?? null,
    content: row.content ?? null,
    position: row.position,
  };

  if (row.type === "criteria") {
    return {
      ...base,
      criteriaItems: criteriaItems.map(serializeSectionCriteriaItem),
    };
  }

  if (row.type === "metrics") {
    return {
      ...base,
      metricItems: metricItems.map(serializeSectionMetricItem),
    };
  }

  if (row.type === "ranked-list") {
    return {
      ...base,
      rankedItems: rankedItems.map(serializeSectionRankedItem),
    };
  }

  return base;
}
