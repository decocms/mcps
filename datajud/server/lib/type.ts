/**
 * Zod schemas for Datajud MCP tools
 */

import { z } from "zod";

/**
 * Common tribunal field used across multiple tools
 */
export const tribunalSchema = z
  .string()
  .describe(
    "Court code (e.g., tjdft, tjsp, tjrj, trf1, tst). If not provided, uses the configured default tribunal.",
  )
  .optional();

/**
 * SEARCH_PROCESSES input schema
 */
export const searchProcessesInputSchema = z.object({
  tribunal: tribunalSchema,
  filters: z
    .record(z.any())
    .optional()
    .describe(
      "Search filters. Examples: {'classe.nome': 'Procedimento Comum', 'grau': 'G2', 'orgaoJulgador.nomeOrgao': '1ª Turma Cível'}",
    ),
  size: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of processes to return (default: 10)"),
  from: z
    .number()
    .optional()
    .default(0)
    .describe("Pagination offset, number of processes to skip (default: 0)"),
  sort: z
    .array(z.record(z.any()))
    .optional()
    .describe("Result sorting. Example: [{'dataAjuizamento': 'desc'}]"),
});

/**
 * SEARCH_PROCESSES output schema
 */
export const searchProcessesOutputSchema = z.object({
  total: z.number().describe("Total number of processes found"),
  returned: z.number().describe("Number of processes returned in this page"),
  processes: z
    .array(z.record(z.any()))
    .describe("List of found processes with their metadata"),
  tribunal: z.string().describe("Code of the consulted tribunal"),
});

/**
 * GET_PROCESS input schema
 */
export const getProcessInputSchema = z.object({
  tribunal: tribunalSchema,
  numeroProcesso: z
    .string()
    .describe(
      "Process number in CNJ format (20 digits). Example: 0000000-00.0000.0.00.0000",
    ),
});

/**
 * GET_PROCESS output schema
 */
export const getProcessOutputSchema = z.object({
  found: z.boolean().describe("Indicates whether the process was found"),
  process: z
    .record(z.any())
    .nullable()
    .describe("Complete process metadata, or null if not found"),
  tribunal: z.string().describe("Code of the consulted tribunal"),
});

/**
 * AGGREGATE_STATISTICS input schema
 */
export const aggregateStatisticsInputSchema = z.object({
  tribunal: tribunalSchema,
  aggregations: z
    .record(z.any())
    .describe(
      "Aggregation definitions in Elasticsearch format. Example: {'por_classe': {'terms': {'field': 'classe.codigo', 'size': 10}}}",
    ),
  filters: z
    .record(z.any())
    .optional()
    .describe(
      "Optional filters to limit processes included in statistics. Same format as SEARCH_PROCESSES.",
    ),
});

/**
 * AGGREGATE_STATISTICS output schema
 */
export const aggregateStatisticsOutputSchema = z.object({
  aggregations: z.record(z.any()).describe("Results of executed aggregations"),
  totalDocuments: z
    .number()
    .describe("Total number of documents that matched the filters"),
  tribunal: z.string().describe("Code of the consulted tribunal"),
});
