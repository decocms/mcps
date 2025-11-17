/**
 * MCP tools for interacting with the Datajud Public API
 *
 * This file implements tools for:
 * - Searching processes with filters
 * - Querying specific processes by number
 * - Executing statistical aggregations
 */
import type { Env } from "../main.ts";
import { createDatajudClient } from "./utils/datajud.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  searchProcessesInputSchema,
  searchProcessesOutputSchema,
  getProcessInputSchema,
  getProcessOutputSchema,
  aggregateStatisticsInputSchema,
  aggregateStatisticsOutputSchema,
} from "../lib/types.ts";

function resolveTribunal(
  customTribunal: string | undefined,
  state: { defaultTribunal?: string },
): string {
  const tribunal = customTribunal || state.defaultTribunal;
  if (!tribunal) {
    throw new Error(
      "Tribunal not specified. Provide the tribunal code or configure a default tribunal.",
    );
  }
  return tribunal;
}

/**
 * SEARCH_PROCESSES - Search processes in Datajud with filters
 */
export const createSearchProcessesTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_PROCESSES",
    description:
      "Search judicial processes in Datajud with filters. Allows filtering by class, subject, court, filing date, and other fields from the Data Transfer Model (MTD). Returns a list of processes with their metadata.",
    inputSchema: searchProcessesInputSchema,
    outputSchema: searchProcessesOutputSchema,
    execute: async ({ context }) => {
      const { tribunal: customTribunal, filters, size, from, sort } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const tribunal = resolveTribunal(customTribunal, state);

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
    inputSchema: getProcessInputSchema,
    outputSchema: getProcessOutputSchema,
    execute: async ({ context }) => {
      const { tribunal: customTribunal, numeroProcesso } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const tribunal = resolveTribunal(customTribunal, state);

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
    inputSchema: aggregateStatisticsInputSchema,
    outputSchema: aggregateStatisticsOutputSchema,
    execute: async ({ context }) => {
      const { tribunal: customTribunal, aggregations, filters } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const tribunal = resolveTribunal(customTribunal, state);

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
