/**
 * HyperDX Tools
 *
 * Tools for querying HyperDX observability data.
 * The API key is retrieved from the Bearer token in the connection.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createHyperDXClient } from "../lib/client.ts";
import { getHyperDXApiKey } from "../lib/env.ts";
import {
  queryChartDataInputSchema,
  queryChartDataOutputSchema,
} from "../lib/types.ts";

/**
 * SEARCH_LOGS - Simple log search tool
 */
export const createSearchLogsTool = (_env: Env) =>
  createPrivateTool({
    id: "SEARCH_LOGS",
    description:
      "Search logs from HyperDX. Returns distinct log messages matching your query with their occurrence count. Use this to find errors, debug issues, or explore log data.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query (e.g., 'level:error', 'service:admin', 'level:error service:api').",
        ),
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 15 * 60 * 1000)
        .describe("Start time in ms. Defaults to 15 minutes ago."),
      endTime: z
        .number()
        .optional()
        .default(() => Date.now())
        .describe("End time in ms. Defaults to now."),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Max number of distinct messages to return. Defaults to 50."),
    }),
    outputSchema: z.object({
      logs: z.array(
        z.object({
          message: z.string(),
          count: z.number(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        series: [
          {
            dataSource: "events",
            aggFn: "count",
            where: context.query,
            groupBy: ["body"],
          },
        ],
      });

      // Transform response: extract body from group and count from series_0.data
      type LogEntry = { message: string; count: number };
      const logs: LogEntry[] = (response.data ?? [])
        .map((item: Record<string, unknown>) => ({
          message: (item.group as string[])?.[0] ?? "",
          count: (item["series_0.data"] as number) ?? 0,
        }))
        .sort((a: LogEntry, b: LogEntry) => b.count - a.count)
        .slice(0, context.limit);

      return {
        logs,
        total: logs.reduce((sum: number, l: LogEntry) => sum + l.count, 0),
      };
    },
  });

const DEFAULT_GROUP_BY = ["body", "service", "site"];

/**
 * GET_LOG_DETAILS - Get detailed log entries with trace context
 */
export const createGetLogDetailsTool = (_env: Env) =>
  createPrivateTool({
    id: "GET_LOG_DETAILS",
    description:
      "Get detailed log entries with custom fields from HyperDX. Group by any fields you want to see in the results.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query (e.g., 'level:error service:admin')."),
      groupBy: z
        .array(z.string())
        .optional()
        .default(DEFAULT_GROUP_BY)
        .describe(
          "Fields to group by and return. Defaults to ['body', 'service', 'site']. Other useful fields: trace_id, span_id, userEmail, env, level.",
        ),
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 15 * 60 * 1000)
        .describe("Start time in ms. Defaults to 15 minutes ago."),
      endTime: z
        .number()
        .optional()
        .default(() => Date.now())
        .describe("End time in ms. Defaults to now."),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max entries to return. Defaults to 20."),
    }),
    outputSchema: z.object({
      fields: z.array(z.string()).describe("The field names in order."),
      entries: z.array(
        z.object({
          values: z
            .array(z.string())
            .describe("Values for each field in order."),
          count: z.number(),
        }),
      ),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        series: [
          {
            dataSource: "events",
            aggFn: "count",
            where: context.query,
            groupBy: context.groupBy,
          },
        ],
      });

      const entries = (response.data ?? [])
        .map((item: Record<string, unknown>) => ({
          values: (item.group as string[]) ?? [],
          count: (item["series_0.data"] as number) ?? 0,
        }))
        .slice(0, context.limit);

      return {
        fields: context.groupBy,
        entries,
      };
    },
  });

/**
 * QUERY_CHART_DATA - Query time series chart data from HyperDX
 */
export const createQueryChartDataTool = (_env: Env) =>
  createPrivateTool({
    id: "QUERY_CHART_DATA",
    description:
      "Query time series chart data from HyperDX. Returns aggregated metrics over time with support for multiple series, grouping, and various aggregation functions. Use this to analyze logs, spans, and metrics.",
    inputSchema: queryChartDataInputSchema,
    outputSchema: queryChartDataOutputSchema,
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const { startTime, endTime, granularity, series, seriesReturnType } =
        context;

      const response = await client.queryChartSeries({
        startTime,
        endTime,
        granularity,
        series: series.map((s) => ({
          dataSource: s.dataSource,
          aggFn: s.aggFn,
          field: s.field,
          where: s.where,
          groupBy: s.groupBy,
          metricDataType: s.metricDataType,
        })),
        seriesReturnType,
      });

      return {
        data: response.data ?? [],
      };
    },
  });

// Export all tools as an array
export const hyperdxTools = [
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
];
