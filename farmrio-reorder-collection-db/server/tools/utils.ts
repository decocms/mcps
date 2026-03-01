import z from "zod";
import type { Env } from "../types/env.ts";
import type {
  CollectionRow,
  RankedListItem,
  ReportCriteria,
  ReportMetric,
  ReportRow,
} from "../database/schema.ts";

export const reportCriteriaSchema = z
  .object({
    nome: z.string().min(1),
    descricao: z.string().optional(),
    peso: z.number().optional(),
  })
  .strict();

export const reportMetricSchema = z
  .object({
    nome: z.string().min(1),
    valor: z.number(),
    unidade: z.string().optional(),
    fonte: z.string().optional(),
  })
  .strict();

export const rankedListItemSchema = z
  .object({
    posicao: z.number().int().positive(),
    itemId: z.union([z.string().min(1), z.number()]),
    score: z.number(),
    detalhes: z
      .record(z.string(), z.union([z.number(), z.string()]))
      .optional(),
  })
  .strict();

export const reportOutputSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    collectionId: z.number().int(),
    summary: z.string(),
    date: z.string(),
    criterios: z.array(reportCriteriaSchema),
    metricas: z.array(reportMetricSchema),
    rankedList: z.array(rankedListItemSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const collectionOutputSchema = z
  .object({
    id: z.string().uuid(),
    collectionId: z.number().int(),
    nome: z.string(),
    isEnable: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

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

export function parseIsoDate(value: string): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid ISO date.");
  }

  return parsedDate;
}

function dateToIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function parseCollectionIdInput(value: string | number): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const parsedNumber = Number(value);

  if (!Number.isInteger(parsedNumber)) {
    throw new Error("collectionId must be an integer.");
  }

  return parsedNumber;
}

export function serializeReport(row: ReportRow): {
  id: string;
  title: string;
  collectionId: number;
  summary: string;
  date: string;
  criterios: ReportCriteria[];
  metricas: ReportMetric[];
  rankedList: RankedListItem[];
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    title: row.title,
    collectionId: row.collection_id,
    summary: row.summary,
    date: dateToIso(row.date),
    criterios: row.criterios,
    metricas: row.metricas,
    rankedList: row.ranked_list,
    createdAt: dateToIso(row.created_at),
    updatedAt: dateToIso(row.updated_at),
  };
}

export function serializeCollection(row: CollectionRow): {
  id: string;
  collectionId: number;
  nome: string;
  isEnable: boolean;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    collectionId: row.collection_id,
    nome: row.nome,
    isEnable: row.is_enable,
    createdAt: dateToIso(row.created_at),
    updatedAt: dateToIso(row.updated_at),
  };
}
