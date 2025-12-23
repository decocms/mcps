/**
 * HyperDX API types and schemas
 */

import { z } from "zod";

// ============================================================================
// HyperDX API Types
// ============================================================================

export type Granularity =
  | "30 second"
  | "1 minute"
  | "5 minute"
  | "10 minute"
  | "15 minute"
  | "30 minute"
  | "1 hour"
  | "2 hour"
  | "6 hour"
  | "12 hour"
  | "1 day"
  | "2 day"
  | "7 day"
  | "30 day";

export type AggFn =
  | "avg"
  | "count"
  | "count_distinct"
  | "max"
  | "min"
  | "p50"
  | "p90"
  | "p95"
  | "p99"
  | "sum";

export interface Serie {
  dataSource: "events" | "metrics";
  aggFn: AggFn;
  field?: string;
  where: string;
  groupBy: string[];
  metricDataType?: "Sum" | "Gauge" | "Histogram";
}

export interface QueryBody {
  startTime: number;
  endTime: number;
  granularity?: Granularity;
  series: Serie[];
  seriesReturnType?: "column" | "ratio";
}

// ============================================================================
// Zod Schemas for Tool Input/Output
// ============================================================================

const GranularitySchema = z.enum([
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
]);

const AggFnSchema = z.enum([
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
]);

const SerieSchema = z.object({
  dataSource: z
    .enum(["events", "metrics"])
    .describe(
      "The data source to query. 'events' for logs/spans, 'metrics' for metrics.",
    ),
  aggFn: AggFnSchema.describe("Aggregation function to apply."),
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
  groupBy: z.array(z.string()).describe("Fields to group results by."),
  metricDataType: z
    .enum(["Sum", "Gauge", "Histogram"])
    .optional()
    .describe("Metric data type (only for metrics data source)."),
});

export const queryChartDataInputSchema = z.object({
  startTime: z
    .number()
    .optional()
    .default(() => Date.now() - 15 * 60 * 1000)
    .describe(
      "Start time in milliseconds since epoch. Defaults to 15 minutes ago.",
    ),
  endTime: z
    .number()
    .optional()
    .default(() => Date.now())
    .describe("End time in milliseconds since epoch. Defaults to now."),
  granularity: GranularitySchema.optional()
    .default("1 minute")
    .describe("Time bucket granularity for aggregation. Defaults to 1 minute."),
  series: z.array(SerieSchema).describe("Array of series to query."),
  seriesReturnType: z
    .enum(["column", "ratio"])
    .optional()
    .describe("Return type for multiple series."),
});

export const queryChartDataOutputSchema = z.object({
  data: z
    .array(z.record(z.string(), z.unknown()))
    .describe(
      "Array of data points. Each point has ts_bucket (timestamp), group (array), and series_N.data (value for series N).",
    ),
});
