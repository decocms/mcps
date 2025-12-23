#!/usr/bin/env bun
/**
 * HyperDX MCP Server - Stdio Transport
 *
 * This allows running the HyperDX MCP locally via stdio,
 * without needing to manage an HTTP server.
 *
 * Usage:
 *   HYPERDX_API_KEY=... bun server/stdio.ts
 *
 * In Mesh, add as STDIO connection:
 *   Command: bun
 *   Args: /path/to/hyperdx/server/stdio.ts
 *   Env: HYPERDX_API_KEY=...
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHyperDXClient } from "./lib/client.ts";

// ============================================================================
// Environment
// ============================================================================

const HYPERDX_API_KEY = process.env.HYPERDX_API_KEY;
if (!HYPERDX_API_KEY) {
  console.error("Error: HYPERDX_API_KEY environment variable is required");
  process.exit(1);
}

// ============================================================================
// MCP Server Setup
// ============================================================================

async function main() {
  const server = new McpServer({
    name: "hyperdx",
    version: "1.0.0",
  });

  const client = createHyperDXClient({ apiKey: HYPERDX_API_KEY });

  // ============================================================================
  // SEARCH_LOGS - Simple log search tool
  // ============================================================================
  server.tool(
    "SEARCH_LOGS",
    "Search logs from HyperDX. Returns distinct log messages matching your query with their occurrence count. Use this to find errors, debug issues, or explore log data.",
    {
      query: z
        .string()
        .describe(
          "Search query (e.g., 'level:error', 'service:admin', 'level:error service:api').",
        ),
      startTime: z
        .number()
        .optional()
        .describe("Start time in ms. Defaults to 15 minutes ago."),
      endTime: z
        .number()
        .optional()
        .describe("End time in ms. Defaults to now."),
      limit: z
        .number()
        .optional()
        .describe("Max number of distinct messages to return. Defaults to 50."),
    },
    async ({ query, startTime, endTime, limit = 50 }) => {
      const now = Date.now();
      const start = startTime ?? now - 15 * 60 * 1000;
      const end = endTime ?? now;

      console.error("[SEARCH_LOGS] Query:", query);

      const response = await client.queryChartSeries({
        startTime: start,
        endTime: end,
        series: [
          {
            dataSource: "events",
            aggFn: "count",
            where: query,
            groupBy: ["body"],
          },
        ],
      });

      const logs = (response.data ?? [])
        .map((item: Record<string, unknown>) => ({
          message: (item.group as string[])?.[0] ?? "",
          count: (item["series_0.data"] as number) ?? 0,
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, limit);

      console.error("[SEARCH_LOGS] Found", logs.length, "distinct messages");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              logs,
              total: logs.reduce(
                (sum: number, l: { count: number }) => sum + l.count,
                0,
              ),
            }),
          },
        ],
      };
    },
  );

  // ============================================================================
  // GET_LOG_DETAILS - Get detailed log entries with trace context
  // ============================================================================
  const DEFAULT_GROUP_BY = ["body", "service", "site"];

  server.tool(
    "GET_LOG_DETAILS",
    "Get detailed log entries with custom fields from HyperDX. Group by any fields you want to see in the results.",
    {
      query: z
        .string()
        .describe("Search query (e.g., 'level:error service:admin')."),
      groupBy: z
        .array(z.string())
        .optional()
        .describe(
          "Fields to group by and return. Defaults to ['body', 'service', 'site']. Other useful fields: trace_id, span_id, userEmail, env, level.",
        ),
      startTime: z
        .number()
        .optional()
        .describe("Start time in ms. Defaults to 15 minutes ago."),
      endTime: z
        .number()
        .optional()
        .describe("End time in ms. Defaults to now."),
      limit: z
        .number()
        .optional()
        .describe("Max entries to return. Defaults to 20."),
    },
    async ({ query, groupBy, startTime, endTime, limit = 20 }) => {
      const now = Date.now();
      const start = startTime ?? now - 15 * 60 * 1000;
      const end = endTime ?? now;
      const fields = groupBy ?? DEFAULT_GROUP_BY;

      console.error("[GET_LOG_DETAILS] Query:", query, "groupBy:", fields);

      const response = await client.queryChartSeries({
        startTime: start,
        endTime: end,
        series: [
          {
            dataSource: "events",
            aggFn: "count",
            where: query,
            groupBy: fields,
          },
        ],
      });

      const entries = (response.data ?? [])
        .map((item: Record<string, unknown>) => ({
          values: (item.group as string[]) ?? [],
          count: (item["series_0.data"] as number) ?? 0,
        }))
        .slice(0, limit);

      console.error("[GET_LOG_DETAILS] Found", entries.length, "entries");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              fields,
              entries,
            }),
          },
        ],
      };
    },
  );

  // ============================================================================
  // QUERY_CHART_DATA - Query time series chart data from HyperDX
  // ============================================================================
  server.tool(
    "QUERY_CHART_DATA",
    "Query time series chart data from HyperDX. Returns aggregated metrics over time with support for multiple series, grouping, and various aggregation functions. Use this to analyze logs, spans, and metrics.",
    {
      startTime: z
        .number()
        .optional()
        .describe(
          "Start time in milliseconds since epoch. Defaults to 15 minutes ago.",
        ),
      endTime: z
        .number()
        .optional()
        .describe("End time in milliseconds since epoch. Defaults to now."),
      granularity: z
        .enum([
          "30 second",
          "1 minute",
          "5 minute",
          "10 minute",
          "15 minute",
          "30 minute",
          "1 hour",
          "2 hour",
          "6 hour",
          "12 hour",
          "1 day",
          "2 day",
          "7 day",
          "30 day",
        ])
        .optional()
        .describe(
          "Time bucket granularity for aggregation. Defaults to 1 minute.",
        ),
      series: z
        .array(
          z.object({
            dataSource: z
              .enum(["events", "metrics"])
              .describe(
                "The data source to query. 'events' for logs/spans, 'metrics' for metrics.",
              ),
            aggFn: z
              .enum([
                "avg",
                "count",
                "count_distinct",
                "max",
                "min",
                "p50",
                "p90",
                "p95",
                "p99",
                "sum",
              ])
              .describe("Aggregation function to apply."),
            field: z
              .string()
              .optional()
              .describe(
                "Field to aggregate (required for some aggregation functions like avg, sum, etc).",
              ),
            where: z
              .string()
              .describe(
                "Search query filter (e.g., 'level:error service:\"my-service\"').",
              ),
            groupBy: z
              .array(z.string())
              .describe("Fields to group results by."),
            metricDataType: z
              .enum(["Sum", "Gauge", "Histogram"])
              .optional()
              .describe("Metric data type (only for metrics data source)."),
          }),
        )
        .describe("Array of series to query."),
      seriesReturnType: z
        .enum(["column", "ratio"])
        .optional()
        .describe("Return type for multiple series."),
    },
    async ({
      startTime,
      endTime,
      granularity = "1 minute",
      series,
      seriesReturnType,
    }) => {
      const now = Date.now();
      const start = startTime ?? now - 15 * 60 * 1000;
      const end = endTime ?? now;

      console.error("[QUERY_CHART_DATA] Starting execution");
      console.error("[QUERY_CHART_DATA] Querying HyperDX API...");

      const response = await client.queryChartSeries({
        startTime: start,
        endTime: end,
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

      console.error(
        "[QUERY_CHART_DATA] Got response with",
        response.data?.length ?? 0,
        "data points",
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              data: response.data ?? [],
            }),
          },
        ],
      };
    },
  );

  // ============================================================================
  // Connect to stdio transport
  // ============================================================================
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[hyperdx] MCP server running via stdio");
  console.error(
    "[hyperdx] Available tools: SEARCH_LOGS, GET_LOG_DETAILS, QUERY_CHART_DATA",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
