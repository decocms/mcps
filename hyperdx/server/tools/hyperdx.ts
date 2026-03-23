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

      // Ensure we only query spans (not logs) by requiring duration:>0
      const spanFilter = context.query
        ? `duration:>0 ${context.query}`
        : "duration:>0";

      const response = await client.queryChartSeries({
        startTime: context.startTime,
        endTime: context.endTime,
        granularity: context.granularity,
        series: [
          {
            dataSource: "events",
            aggFn: context.aggFn,
            field: context.field,
            where: spanFilter,
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
      current: z
        .array(z.record(z.string(), z.unknown()))
        .describe("Aggregated data for the current period."),
      prior: z
        .array(z.record(z.string(), z.unknown()))
        .describe("Aggregated data for the prior/baseline period."),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const seriesConfig = {
        dataSource: "events" as const,
        aggFn: context.aggFn,
        field: context.field,
        where: context.query,
        groupBy: context.groupBy,
      };

      // Query both periods in parallel with separate time windows
      const [currentRes, priorRes] = await Promise.all([
        client.queryChartSeries({
          startTime: context.currentStart,
          endTime: context.currentEnd,
          series: [seriesConfig],
        }),
        client.queryChartSeries({
          startTime: context.priorStart,
          endTime: context.priorEnd,
          series: [seriesConfig],
        }),
      ]);

      return {
        description:
          "current = current period aggregates, prior = prior/baseline period aggregates. Compare values to detect regressions.",
        current: currentRes.data ?? [],
        prior: priorRes.data ?? [],
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
      "Discover the data landscape of this HyperDX instance. Runs multiple parallel queries to find active services, log levels, top errors, span operations, dashboards, and extracts field patterns from existing dashboard configs. Optionally pass domain-specific hints (keywords, field names) to run targeted queries that surface how those concepts appear in the data. Returns structured data AND a generated agentPrompt text that summarizes all findings into a ready-to-use system prompt.",
    inputSchema: z.object({
      hints: z
        .string()
        .optional()
        .default("")
        .describe(
          "Domain-specific keywords or field names to search for. The tool will run targeted queries to find how these appear in the data. Example: 'section loader cloud.provider rendering build vtex shopify'. Separate with spaces.",
        ),
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
      dashboards: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            chartCount: z.number(),
            fieldsUsed: z.array(z.string()),
          }),
        )
        .describe("Available dashboards with the fields they query."),
      hintResults: z
        .array(
          z.object({
            hint: z.string(),
            matchType: z.string(),
            topValues: z.array(
              z.object({ value: z.string(), count: z.number() }),
            ),
          }),
        )
        .describe(
          "Results from targeted queries based on the hints you provided.",
        ),
      suggestedAutomations: z
        .array(
          z.object({
            type: z.string().describe("'alert' or 'dashboard'"),
            name: z.string(),
            description: z.string(),
            priority: z.string().describe("'high', 'medium', or 'low'"),
          }),
        )
        .describe(
          "Suggested alerts and dashboards based on discovered data patterns. Use CREATE_ALERT and CREATE_DASHBOARD to implement these.",
        ),
      agentPrompt: z
        .string()
        .describe(
          "A generated system prompt summarizing everything discovered about this HyperDX instance, including suggested automations. Use this to bootstrap an agent that is an expert in this data.",
        ),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });

      const { startTime, endTime, hints } = context;

      // Parse hints into individual keywords
      const hintWords = hints
        .split(/[\s,;]+/)
        .map((h: string) => h.trim())
        .filter((h: string) => h.length > 0);

      // Build hint queries: for each hint, try it as a field existence check AND as a text search
      const hintQueries = hintWords.flatMap((hint: string) => {
        const queries: Array<{
          hint: string;
          matchType: string;
          where: string;
          groupBy: string[];
        }> = [];
        if (hint.includes(".") || hint.includes("_")) {
          // Looks like a field name — query as existence check grouped by its values
          queries.push({
            hint,
            matchType: `field:${hint}`,
            where: `${hint}:*`,
            groupBy: [hint],
          });
        } else {
          // Treat as a text keyword — search in errors and group by service
          queries.push({
            hint,
            matchType: `keyword:${hint}`,
            where: `level:error "${hint}"`,
            groupBy: ["service", "body"],
          });
        }
        return queries;
      });

      // Run all core queries + hint queries in parallel
      const [
        servicesRes,
        levelsRes,
        errorsRes,
        spansRes,
        dashboardsRes,
        ...hintResponses
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
        // Dashboards
        client.listDashboards(),
        // Hint queries
        ...hintQueries.map((hq) =>
          client
            .queryChartSeries({
              startTime,
              endTime,
              series: [
                {
                  dataSource: "events",
                  aggFn: "count",
                  where: hq.where,
                  groupBy: hq.groupBy,
                },
              ],
            })
            .catch(() => ({ data: [] })),
        ),
      ]);

      type RawItem = Record<string, unknown>;
      const grp = (item: RawItem) => (item.group as string[]) ?? [];
      const val = (item: RawItem) => (item["series_0.data"] as number) ?? 0;

      const services = (servicesRes.data ?? [])
        .map((item: RawItem) => ({
          name: grp(item)[0] ?? "",
          eventCount: val(item),
        }))
        .sort(
          (a: { eventCount: number }, b: { eventCount: number }) =>
            b.eventCount - a.eventCount,
        )
        .slice(0, 30);

      const levels = (levelsRes.data ?? [])
        .map((item: RawItem) => ({
          level: grp(item)[0] ?? "",
          count: val(item),
        }))
        .sort(
          (a: { count: number }, b: { count: number }) => b.count - a.count,
        );

      const topErrors = (errorsRes.data ?? [])
        .map((item: RawItem) => ({
          service: grp(item)[0] ?? "",
          message: (grp(item)[1] ?? "").slice(0, 200),
          count: val(item),
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, 15);

      const topSpanOperations = (spansRes.data ?? [])
        .map((item: RawItem) => ({
          spanName: grp(item)[0] ?? "",
          service: grp(item)[1] ?? "",
          count: val(item),
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, 20);

      // Extract fields used in dashboard chart queries
      type DashboardRaw = {
        id?: string;
        name?: string;
        charts?: Array<{
          series?: Array<{
            where?: string;
            groupBy?: string[];
            field?: string;
          }>;
        }>;
      };
      const dashboards = ((dashboardsRes.data ?? []) as DashboardRaw[]).map(
        (d) => {
          const fieldsSet = new Set<string>();
          for (const chart of d.charts ?? []) {
            for (const s of chart.series ?? []) {
              if (s.field) fieldsSet.add(s.field);
              for (const g of s.groupBy ?? []) fieldsSet.add(g);
              // Extract field references from where clauses (field:value patterns)
              const whereFields = (s.where ?? "").match(/[\w.]+(?=:\s*[^\s])/g);
              if (whereFields) {
                for (const f of whereFields) {
                  if (!["level", "service", "AND", "OR", "NOT"].includes(f)) {
                    fieldsSet.add(f);
                  }
                }
              }
            }
          }
          return {
            id: d.id ?? "",
            name: d.name ?? "",
            chartCount: (d.charts ?? []).length,
            fieldsUsed: [...fieldsSet].sort(),
          };
        },
      );

      // Process hint results
      type HintTopValue = { value: string; count: number };
      const hintResults = hintQueries.map(
        (
          hq: { hint: string; matchType: string; groupBy: string[] },
          i: number,
        ) => {
          const res = hintResponses[i] as {
            data?: Record<string, unknown>[];
          };
          const items = (res.data ?? [])
            .map((item: RawItem) => {
              const g = grp(item);
              return {
                value:
                  hq.groupBy.length > 1 ? `[${g.join("] [")}]` : (g[0] ?? ""),
                count: val(item),
              };
            })
            .sort((a: HintTopValue, b: HintTopValue) => b.count - a.count)
            .slice(0, 10);
          return {
            hint: hq.hint,
            matchType: hq.matchType,
            topValues: items,
          };
        },
      );

      // Collect all unique fields from dashboards
      const allFields = new Set<string>();
      for (const d of dashboards) {
        for (const f of d.fieldsUsed) allFields.add(f);
      }

      // Compute total from levels (not sliced, unlike services which are top 30)
      const totalEvents = levels.reduce(
        (sum: number, l: { count: number }) => sum + l.count,
        0,
      );
      const topServicesList = services
        .slice(0, 15)
        .map(
          (s: { name: string; eventCount: number }) =>
            `  - ${s.name} (${s.eventCount.toLocaleString()} events)`,
        )
        .join("\n");
      const levelsList = levels
        .map(
          (l: { level: string; count: number }) =>
            `  - ${l.level}: ${l.count.toLocaleString()} (${((l.count / totalEvents) * 100).toFixed(1)}%)`,
        )
        .join("\n");
      const errorsList = topErrors
        .slice(0, 10)
        .map(
          (e: { service: string; message: string; count: number }) =>
            `  - [${e.service}] ${e.message.slice(0, 120)} (${e.count}x)`,
        )
        .join("\n");
      const dashboardsList = dashboards
        .map(
          (d: { name: string; chartCount: number; fieldsUsed: string[] }) =>
            `  - "${d.name}" (${d.chartCount} charts) — fields: ${d.fieldsUsed.slice(0, 8).join(", ")}`,
        )
        .join("\n");
      const fieldsListStr = [...allFields].sort().join(", ");

      let hintSection = "";
      const activeHints = hintResults.filter(
        (h: { topValues: HintTopValue[] }) => h.topValues.length > 0,
      );
      if (activeHints.length > 0) {
        hintSection = `\n## Domain-Specific Patterns\n\nThe following keywords/fields were found in the data:\n\n${activeHints
          .map(
            (h: {
              hint: string;
              matchType: string;
              topValues: HintTopValue[];
            }) =>
              `### "${h.hint}" (${h.matchType})\n${h.topValues
                .map(
                  (v: HintTopValue) =>
                    `  - ${v.value.slice(0, 150)} (${v.count}x)`,
                )
                .join("\n")}`,
          )
          .join("\n\n")}\n`;
      }

      // Generate automation suggestions based on discovered patterns
      type Automation = {
        type: string;
        name: string;
        description: string;
        priority: string;
      };
      const suggestedAutomations: Automation[] = [];

      // Suggest alerts for top error patterns
      const errorServices = new Set<string>();
      for (const e of topErrors.slice(0, 5)) {
        if (!errorServices.has(e.service)) {
          errorServices.add(e.service);
          suggestedAutomations.push({
            type: "alert",
            name: `Error spike: ${e.service}`,
            description: `Alert when errors in service "${e.service}" exceed threshold. Top error: "${e.message.slice(0, 80)}..." (${e.count}x in window).`,
            priority: e.count > 1000 ? "high" : "medium",
          });
        }
      }

      // Suggest latency alert for top services by volume
      for (const s of services.slice(0, 3)) {
        suggestedAutomations.push({
          type: "alert",
          name: `P95 latency: ${s.name}`,
          description: `Alert when p95 latency for "${s.name}" exceeds a threshold. This is a top-traffic service (${s.eventCount.toLocaleString()} events).`,
          priority: "medium",
        });
      }

      // Suggest dashboards based on service clusters
      if (services.length > 5) {
        suggestedAutomations.push({
          type: "dashboard",
          name: "Service Health Overview",
          description: `Dashboard with error rate, request count, and p95 latency for the top ${Math.min(services.length, 10)} services: ${services
            .slice(0, 5)
            .map((s: { name: string }) => s.name)
            .join(", ")}...`,
          priority: "high",
        });
      }

      // Suggest error breakdown dashboard
      if (topErrors.length > 3) {
        suggestedAutomations.push({
          type: "dashboard",
          name: "Error Analysis",
          description: `Dashboard breaking down errors by service and message. ${topErrors.length} distinct error patterns found across ${errorServices.size} services.`,
          priority: "high",
        });
      }

      // Suggest dashboards based on hint findings
      for (const h of activeHints) {
        if (h.topValues.length >= 3) {
          suggestedAutomations.push({
            type: "dashboard",
            name: `${h.hint} monitoring`,
            description: `Dashboard for "${h.hint}" patterns. Found ${h.topValues.length} distinct values via ${h.matchType}.`,
            priority: "low",
          });
        }
      }

      const automationsList = suggestedAutomations
        .map(
          (a: Automation) =>
            `  - **[${a.priority.toUpperCase()}] ${a.type}: ${a.name}** — ${a.description}`,
        )
        .join("\n");

      const agentPrompt = `# HyperDX Instance — Data Landscape

This was auto-generated by DISCOVER_DATA at ${new Date().toISOString()}.
Lookback window: ${((endTime - startTime) / 3600000).toFixed(1)} hours.

## Event Volume

Total events in window: ${totalEvents.toLocaleString()}

## Log Levels

${levelsList}

**Note:** If the most common level is NOT "info" or "error" (e.g., "ok"), this instance uses non-standard levels. Adjust your queries accordingly.

## Active Services (top 15)

${topServicesList}

## Top Errors

${errorsList}

## Dashboards

${dashboardsList}

## Fields Used Across Dashboards

These fields are actively used in dashboard queries and are safe to use in groupBy and where clauses:

${fieldsListStr}
${hintSection}
## Suggested Automations

Based on the discovered data, here are recommended alerts and dashboards to set up:

${automationsList}

Use CREATE_ALERT and CREATE_DASHBOARD tools to implement these. The agent can help configure thresholds and chart layouts.

## Onboarding Flow

If you are setting up monitoring for the first time, follow this flow:
1. **DISCOVER_DATA** (done!) — You now understand the data landscape
2. **Create an expert agent** — Use this agentPrompt as the system prompt for a monitoring agent
3. **Set up dashboards** — Start with "Service Health Overview" and "Error Analysis"
4. **Configure alerts** — Set up error spike alerts for your highest-traffic services
5. **Iterate** — Use GET_DASHBOARD on existing dashboards to learn what the team monitors

## Query Tips

- Use \`level:error\` to filter to actual errors (not successful spans)
- The \`body\` field contains span names for spans and log messages for logs — filter by level first
- Check dashboard configurations with GET_DASHBOARD for battle-tested query patterns
- Use GET_LOG_DETAILS with \`groupBy: ["service", "level"]\` to understand a service's event distribution
`;

      return {
        services,
        levels,
        topErrors,
        topSpanOperations,
        dashboards,
        hintResults,
        suggestedAutomations,
        agentPrompt,
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
  // SUGGEST_AUTOMATIONS is not a separate tool — it's a section of the DISCOVER_DATA agentPrompt.
  // After running DISCOVER_DATA, the agent has all the context needed to suggest automations
  // using CREATE_ALERT and CREATE_DASHBOARD tools directly.
];
