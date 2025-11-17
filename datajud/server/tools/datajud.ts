/**
 * MCP tools for interacting with the Datajud Public API
 *
 * This file implements tools for:
 * - Searching processes with filters
 * - Querying specific processes by number
 * - Executing statistical aggregations
 */
import { z } from "zod";
import type { Env } from "../main.ts";
import { createDatajudClient } from "./utils/datajud.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
/**
 * SEARCH_PROCESSES - Search processes in Datajud with filters
 */
export const createSearchProcessesTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_PROCESSES",
    description:
      "Search judicial processes in Datajud with filters. Allows filtering by class, subject, court, filing date, and other fields from the Data Transfer Model (MTD). Returns a list of processes with their metadata.",
    inputSchema: z.object({
      tribunal: z
        .string()
        .describe(
          "Court code (e.g., tjdft, tjsp, tjrj, trf1, tst). If not provided, uses the configured default tribunal.",
        )
        .optional(),
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
        .describe(
          "Pagination offset, number of processes to skip (default: 0)",
        ),
      sort: z
        .array(z.record(z.any()))
        .optional()
        .describe("Result sorting. Example: [{'dataAjuizamento': 'desc'}]"),
    }),
    outputSchema: z.object({
      total: z.number().describe("Total number of processes found"),
      returned: z
        .number()
        .describe("Number of processes returned in this page"),
      processes: z
        .array(z.record(z.any()))
        .describe("List of found processes with their metadata"),
      tribunal: z.string().describe("Code of the consulted tribunal"),
    }),
    execute: async ({ context }) => {
      const { tribunal: customTribunal, filters, size, from, sort } = context;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      // Determine which tribunal to use
      const tribunal = customTribunal || state.defaultTribunal;
      if (!tribunal) {
        throw new Error(
          "Tribunal not specified. Provide the tribunal code or configure a default tribunal.",
        );
      }

      // Create Datajud client
      const client = createDatajudClient({
        apiKey: state.apiKey,
        tribunal,
      });

      try {
        // Execute the search
        const response = await client.searchProcesses({
          filters,
          size,
          from,
          sort,
        });

        return {
          total: response.hits.total.value,
          returned: response.hits.hits.length,
          processes: response.hits.hits.map((hit) => hit._source),
          tribunal,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to search processes: ${message}`);
      }
    },
  });

/**
 * GET_PROCESS - Search for a specific process by number
 */
export const createGetProcessTool = (env: Env) =>
  createPrivateTool({
    id: "GET_PROCESS",
    description:
      "Search for a specific judicial process by process number in Datajud. Returns all available process metadata, including class, subjects, movements, court, etc.",
    inputSchema: z.object({
      tribunal: z
        .string()
        .describe(
          "Court code (e.g., tjdft, tjsp, tjrj, trf1, tst). If not provided, uses the configured default tribunal.",
        )
        .optional(),
      numeroProcesso: z
        .string()
        .describe(
          "Process number in CNJ format (20 digits). Example: 0000000-00.0000.0.00.0000",
        ),
    }),
    outputSchema: z.object({
      found: z.boolean().describe("Indicates whether the process was found"),
      process: z
        .record(z.any())
        .nullable()
        .describe("Complete process metadata, or null if not found"),
      tribunal: z.string().describe("Code of the consulted tribunal"),
    }),
    execute: async ({ context }) => {
      const { tribunal: customTribunal, numeroProcesso } = context;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      // Determine which tribunal to use
      const tribunal = customTribunal || state.defaultTribunal;
      if (!tribunal) {
        throw new Error(
          "Tribunal not specified. Provide the tribunal code or configure a default tribunal.",
        );
      }

      // Create Datajud client
      const client = createDatajudClient({
        apiKey: state.apiKey,
        tribunal,
      });

      try {
        // Search for the process
        const process = await client.getProcessByNumber(numeroProcesso);

        return {
          found: process !== null,
          process,
          tribunal,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to search process: ${message}`);
      }
    },
  });

/**
 * AGGREGATE_STATISTICS - Execute aggregations and generate statistics
 */
export const createAggregateStatisticsTool = (env: Env) =>
  createPrivateTool({
    id: "AGGREGATE_STATISTICS",
    description:
      "Execute aggregations and generate statistics about judicial processes in Datajud. Allows calculating counts, averages, sums, and other metrics grouped by fields such as class, subject, court, filing year, etc. Uses Elasticsearch aggregation syntax.",
    inputSchema: z.object({
      tribunal: z
        .string()
        .describe(
          "Court code (e.g., tjdft, tjsp, tjrj, trf1, tst). If not provided, uses the configured default tribunal.",
        )
        .optional(),
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
    }),
    outputSchema: z.object({
      aggregations: z
        .record(z.any())
        .describe("Results of executed aggregations"),
      totalDocuments: z
        .number()
        .describe("Total number of documents that matched the filters"),
      tribunal: z.string().describe("Code of the consulted tribunal"),
    }),
    execute: async ({ context }) => {
      const { tribunal: customTribunal, aggregations, filters } = context;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      // Determine which tribunal to use
      const tribunal = customTribunal || state.defaultTribunal;
      if (!tribunal) {
        throw new Error(
          "Tribunal not specified. Provide the tribunal code or configure a default tribunal.",
        );
      }

      // Create Datajud client
      const client = createDatajudClient({
        apiKey: state.apiKey,
        tribunal,
      });

      try {
        // Execute aggregations
        const response = await client.aggregateStatistics({
          aggregations,
          filters,
        });

        return {
          aggregations: response.aggregations || {},
          totalDocuments: response.hits.total.value,
          tribunal,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to execute aggregations: ${message}`);
      }
    },
  });

/**
 * Array of all Datajud tools
 */
export const datajudTools = [
  createSearchProcessesTool,
  createGetProcessTool,
  createAggregateStatisticsTool,
];
