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
    collectionId: z.union([z.string(), z.number()]),
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

export function getDatabaseUrl(env: Env): string {
  const _env = env;
  void _env;
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

function parseCollectionId(value: string): string | number {
  const parsedNumber = Number(value);

  if (Number.isInteger(parsedNumber) && String(parsedNumber) === value) {
    return parsedNumber;
  }

  return value;
}

export function serializeReport(row: ReportRow): {
  id: string;
  title: string;
  collectionId: string | number;
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
    collectionId: parseCollectionId(row.collection_id),
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
