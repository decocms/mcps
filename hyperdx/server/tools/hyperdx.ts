/**
 * HyperDX Tools
 *
 * Tools for querying HyperDX observability data.
 * The API key is retrieved from the Bearer token in the connection.
 */

import { createTool } from "@decocms/runtime/tools";
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
  createTool({
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
    // IMPORTANT: Use runtimeContext.env (from current request) not env (from tool creation)
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
  createTool({
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
    // IMPORTANT: Use runtimeContext.env (from current request) not env (from tool creation)
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
  createTool({
    id: "QUERY_CHART_DATA",
    description:
      "Query time series chart data from HyperDX. Returns aggregated metrics over time with support for multiple series, grouping, and various aggregation functions. Use this to analyze logs, spans, and metrics.",
    inputSchema: queryChartDataInputSchema,
    outputSchema: queryChartDataOutputSchema,
    // IMPORTANT: Use runtimeContext.env (from current request) not env (from tool creation)
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

/**
 * QUERY_SPANS - Query trace/span data with span-aware defaults
 */
export const createQuerySpansTool = (_env: Env) =>
  createTool({
    id: "QUERY_SPANS",
    description:
      "Query trace and span data from HyperDX. Use this to analyze request latency, error rates by operation, slow traces, and service dependency performance. Groups by span_name and service by default.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search filter (e.g., 'service:api level:error', 'duration:>1000 service:checkout'). Leave empty to query all spans.",
        ),
      aggFn: z
        .enum([
          "count",
          "avg",
          "p50",
          "p90",
          "p95",
          "p99",
          "max",
          "min",
          "sum",
          "p50_rate",
          "p95_rate",
          "p99_rate",
        ])
        .optional()
        .default("p95")
        .describe(
          "Aggregation function. Use p50/p95/p99 for latency percentiles, count for throughput, avg for average duration. Defaults to p95.",
        ),
      field: z
        .string()
        .optional()
        .default("duration")
        .describe(
          "Field to aggregate. Defaults to 'duration' (span duration in ms). Use 'duration' for latency analysis.",
        ),
      groupBy: z
        .array(z.string())
        .optional()
        .default(["span_name", "service"])
        .describe(
          "Fields to group by. Defaults to ['span_name', 'service']. Other useful fields: http.method, http.status_code, db.system.",
        ),
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
        ])
        .optional()
        .default("5 minute")
        .describe("Time bucket granularity. Defaults to 5 minutes."),
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 60 * 60 * 1000)
        .describe("Start time in ms. Defaults to 1 hour ago."),
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
      data: z.array(z.record(z.string(), z.unknown())),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        granularity: context.granularity,
        series: [
          {
            dataSource: "events",
            aggFn: context.aggFn,
            field: context.field,
            where: context.query,
            groupBy: context.groupBy,
          },
        ],
      });

      return { data: (response.data ?? []).slice(0, context.limit) };
    },
  });

/**
 * QUERY_METRICS - Query infrastructure/application metrics
 */
export const createQueryMetricsTool = (_env: Env) =>
  createTool({
    id: "QUERY_METRICS",
    description:
      "Query metrics from HyperDX (Gauge, Sum, or Histogram types). Use this for infrastructure metrics like CPU, memory, request rates, and custom application metrics.",
    inputSchema: z.object({
      metricName: z
        .string()
        .describe(
          "The metric name to query (e.g., 'system.cpu.utilization', 'http.server.request.duration', 'process.runtime.jvm.memory.usage').",
        ),
      metricDataType: z
        .enum(["Gauge", "Sum", "Histogram"])
        .describe(
          "Metric data type. Use 'Gauge' for point-in-time values (CPU%, memory), 'Sum' for cumulative counters (request count), 'Histogram' for distributions (latency).",
        ),
      aggFn: z
        .enum([
          "avg",
          "avg_rate",
          "max",
          "max_rate",
          "min",
          "min_rate",
          "p50",
          "p50_rate",
          "p90",
          "p90_rate",
          "p95",
          "p95_rate",
          "p99",
          "p99_rate",
          "sum",
          "sum_rate",
        ])
        .optional()
        .default("avg")
        .describe(
          "Aggregation function. Use *_rate variants for Sum-type counters to get per-second rates. Defaults to avg.",
        ),
      where: z
        .string()
        .optional()
        .default("")
        .describe(
          "Filter query (e.g., 'host:web-01', 'k8s.namespace:production'). Leave empty to query all.",
        ),
      groupBy: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          "Fields to group by (e.g., ['host'], ['k8s.pod.name'], ['service']). Leave empty for a single aggregated series.",
        ),
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
        ])
        .optional()
        .default("5 minute")
        .describe("Time bucket granularity. Defaults to 5 minutes."),
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 60 * 60 * 1000)
        .describe("Start time in ms. Defaults to 1 hour ago."),
      endTime: z
        .number()
        .optional()
        .default(() => Date.now())
        .describe("End time in ms. Defaults to now."),
    }),
    outputSchema: z.object({
      data: z.array(z.record(z.string(), z.unknown())),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        granularity: context.granularity,
        series: [
          {
            dataSource: "metrics",
            aggFn: context.aggFn,
            field: context.metricName,
            where: context.where,
            groupBy: context.groupBy,
            metricDataType: context.metricDataType,
          },
        ],
      });

      return { data: response.data ?? [] };
    },
  });

/**
 * GET_SERVICE_HEALTH - Multi-series service health snapshot
 */
export const createGetServiceHealthTool = (_env: Env) =>
  createTool({
    id: "GET_SERVICE_HEALTH",
    description:
      "Get a health snapshot for a service: error rate, request throughput, and p95 latency in a single call. Returns three parallel time series. Ideal for incident triage and service health checks.",
    inputSchema: z.object({
      service: z
        .string()
        .describe("Service name to query (e.g., 'api', 'checkout', 'web')."),
      granularity: z
        .enum([
          "1 minute",
          "5 minute",
          "10 minute",
          "15 minute",
          "30 minute",
          "1 hour",
        ])
        .optional()
        .default("5 minute")
        .describe("Time bucket granularity. Defaults to 5 minutes."),
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 60 * 60 * 1000)
        .describe("Start time in ms. Defaults to 1 hour ago."),
      endTime: z
        .number()
        .optional()
        .default(() => Date.now())
        .describe("End time in ms. Defaults to now."),
    }),
    outputSchema: z.object({
      description: z.string(),
      data: z.array(z.record(z.string(), z.unknown())),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        granularity: context.granularity,
        series: [
          {
            dataSource: "events",
            aggFn: "count",
            where: `service:${context.service} level:error`,
            groupBy: [],
          },
          {
            dataSource: "events",
            aggFn: "count",
            where: `service:${context.service}`,
            groupBy: [],
          },
          {
            dataSource: "events",
            aggFn: "p95",
            field: "duration",
            where: `service:${context.service}`,
            groupBy: [],
          },
        ],
      });

      return {
        description:
          "series_0.data=error_count, series_1.data=total_request_count, series_2.data=p95_latency_ms",
        data: response.data ?? [],
      };
    },
  });

/**
 * COMPARE_TIME_RANGES - Compare a metric between two periods using ratio
 */
export const createCompareTimeRangesTool = (_env: Env) =>
  createTool({
    id: "COMPARE_TIME_RANGES",
    description:
      "Compare a metric between the current period and a prior period using ratio analysis. Returns the ratio of current/prior so you can detect regressions or improvements. A ratio >1 means the current period is higher.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search filter for the events/spans to measure (e.g., 'service:api level:error', 'service:checkout').",
        ),
      aggFn: z
        .enum(["count", "avg", "p50", "p95", "p99", "max", "sum"])
        .optional()
        .default("count")
        .describe("What to measure. Defaults to count."),
      field: z
        .string()
        .optional()
        .describe(
          "Field to aggregate (required for avg, p50, p95, p99, max, sum — e.g., 'duration').",
        ),
      currentStart: z.number().describe("Start of the current period in ms."),
      currentEnd: z.number().describe("End of the current period in ms."),
      priorStart: z
        .number()
        .describe("Start of the prior/baseline period in ms."),
      priorEnd: z.number().describe("End of the prior/baseline period in ms."),
      groupBy: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Fields to group the comparison by (e.g., ['service'])."),
    }),
    outputSchema: z.object({
      description: z.string(),
      data: z.array(z.record(z.string(), z.unknown())),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      // Use the wider window spanning both periods
      const startTime = Math.min(context.priorStart, context.currentStart);
      const endTime = Math.max(context.priorEnd, context.currentEnd);

      const response = await client.queryChartSeries({
        startTime,
        endTime,
        seriesReturnType: "ratio",
        series: [
          {
            dataSource: "events",
            aggFn: context.aggFn,
            field: context.field,
            where: context.query,
            groupBy: context.groupBy,
          },
          {
            dataSource: "events",
            aggFn: context.aggFn,
            field: context.field,
            where: context.query,
            groupBy: context.groupBy,
          },
        ],
      });

      return {
        description:
          "series_0.data=current_value, series_1.data=prior_value, ratio=current/prior. Ratio >1 means current is higher than prior.",
        data: response.data ?? [],
      };
    },
  });

/**
 * DISCOVER_DATA - Introspect this HyperDX instance's data landscape
 */
export const createDiscoverDataTool = (_env: Env) =>
  createTool({
    id: "DISCOVER_DATA",
    description:
      "Discover the data landscape of this HyperDX instance. Runs multiple queries to find: active services, log levels in use, top error patterns, available dashboards, key span operations, and cloud providers. Use this first when you need to understand what data exists before building queries.",
    inputSchema: z.object({
      startTime: z
        .number()
        .optional()
        .default(() => Date.now() - 6 * 60 * 60 * 1000)
        .describe(
          "Start time in ms. Defaults to 6 hours ago for broader coverage.",
        ),
      endTime: z
        .number()
        .optional()
        .default(() => Date.now())
        .describe("End time in ms. Defaults to now."),
    }),
    outputSchema: z.object({
      services: z
        .array(z.object({ name: z.string(), eventCount: z.number() }))
        .describe("Active services by event count."),
      levels: z
        .array(z.object({ level: z.string(), count: z.number() }))
        .describe("Log levels in use and their counts."),
      topErrors: z
        .array(
          z.object({
            service: z.string(),
            message: z.string(),
            count: z.number(),
          }),
        )
        .describe("Top error messages by service."),
      topSpanOperations: z
        .array(
          z.object({
            spanName: z.string(),
            service: z.string(),
            count: z.number(),
          }),
        )
        .describe("Top span operations by service."),
      cloudProviders: z
        .array(z.object({ provider: z.string(), count: z.number() }))
        .describe("Cloud providers in use."),
      dashboards: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            chartCount: z.number(),
          }),
        )
        .describe("Available dashboards."),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const { startTime, endTime } = context;

      // Run all discovery queries in parallel
      const [
        servicesRes,
        levelsRes,
        errorsRes,
        spansRes,
        cloudRes,
        dashboardsRes,
      ] = await Promise.all([
        // Services by event count
        client.queryChartSeries({
          startTime,
          endTime,
          series: [
            {
              dataSource: "events",
              aggFn: "count",
              where: "",
              groupBy: ["service"],
            },
          ],
        }),
        // Levels distribution
        client.queryChartSeries({
          startTime,
          endTime,
          series: [
            {
              dataSource: "events",
              aggFn: "count",
              where: "",
              groupBy: ["level"],
            },
          ],
        }),
        // Top errors
        client.queryChartSeries({
          startTime,
          endTime,
          series: [
            {
              dataSource: "events",
              aggFn: "count",
              where: "level:error",
              groupBy: ["service", "body"],
            },
          ],
        }),
        // Top span operations
        client.queryChartSeries({
          startTime,
          endTime,
          series: [
            {
              dataSource: "events",
              aggFn: "count",
              where: "duration:>0",
              groupBy: ["span_name", "service"],
            },
          ],
        }),
        // Cloud providers
        client.queryChartSeries({
          startTime,
          endTime,
          series: [
            {
              dataSource: "events",
              aggFn: "count",
              where: "cloud.provider:*",
              groupBy: ["cloud.provider"],
            },
          ],
        }),
        // Dashboards
        client.listDashboards(),
      ]);

      type RawItem = Record<string, unknown>;
      const group = (item: RawItem) => (item.group as string[]) ?? [];
      const val = (item: RawItem) => (item["series_0.data"] as number) ?? 0;

      const services = (servicesRes.data ?? [])
        .map((item: RawItem) => ({
          name: group(item)[0] ?? "",
          eventCount: val(item),
        }))
        .sort(
          (a: { eventCount: number }, b: { eventCount: number }) =>
            b.eventCount - a.eventCount,
        )
        .slice(0, 30);

      const levels = (levelsRes.data ?? [])
        .map((item: RawItem) => ({
          level: group(item)[0] ?? "",
          count: val(item),
        }))
        .sort(
          (a: { count: number }, b: { count: number }) => b.count - a.count,
        );

      const topErrors = (errorsRes.data ?? [])
        .map((item: RawItem) => ({
          service: group(item)[0] ?? "",
          message: (group(item)[1] ?? "").slice(0, 200),
          count: val(item),
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, 15);

      const topSpanOperations = (spansRes.data ?? [])
        .map((item: RawItem) => ({
          spanName: group(item)[0] ?? "",
          service: group(item)[1] ?? "",
          count: val(item),
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, 20);

      const cloudProviders = (cloudRes.data ?? [])
        .map((item: RawItem) => ({
          provider: group(item)[0] ?? "",
          count: val(item),
        }))
        .sort(
          (a: { count: number }, b: { count: number }) => b.count - a.count,
        );

      const dashboards = (dashboardsRes.data ?? []).map((d: RawItem) => ({
        id: (d.id as string) ?? "",
        name: (d.name as string) ?? "",
        chartCount: ((d.charts as unknown[]) ?? []).length,
      }));

      return {
        services,
        levels,
        topErrors,
        topSpanOperations,
        cloudProviders,
        dashboards,
      };
    },
  });

// Export all tools as an array
export const hyperdxTools = [
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
  createQuerySpansTool,
  createQueryMetricsTool,
  createGetServiceHealthTool,
  createCompareTimeRangesTool,
  createDiscoverDataTool,
];
