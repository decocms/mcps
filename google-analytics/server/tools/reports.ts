import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import {
  RunReportOutputSchema,
  RunFunnelReportOutputSchema,
  RunRealtimeReportOutputSchema,
} from "../lib/schemas.ts";

// Some MCP clients serialize arrays/objects as JSON strings instead of native
// types. This preprocessor parses the string before Zod validates it.
const fromJson = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => {
    if (typeof val !== "string") return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }, schema);

const DateRangeSchema = z.object({
  startDate: z
    .string()
    .describe(
      "Inclusive start date in YYYY-MM-DD format, or relative values: 'today', 'yesterday', 'NdaysAgo'.",
    ),
  endDate: z
    .string()
    .describe(
      "Inclusive end date in YYYY-MM-DD format, or relative values: 'today', 'yesterday'.",
    ),
});

const DimensionSchema = z.object({ name: z.string() });
const MetricSchema = z.object({ name: z.string() });

// FilterExpression and OrderBy are passed as raw JSON objects matching the GA4 REST API schema.
const FilterExpressionSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "GA4 FilterExpression object. See https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FilterExpression",
  );

const OrderBySchema = z
  .record(z.string(), z.unknown())
  .describe(
    "GA4 OrderBy object. See https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/OrderBy",
  );

export const runReportTool = (env: Env) =>
  createPrivateTool({
    id: "run-report",
    description:
      "Runs a Google Analytics 4 report using the Data API. Returns dimensions, metrics, and row data for the specified property and date range.",
    inputSchema: z.object({
      property: z
        .string()
        .describe(
          "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
        ),
      dateRanges: fromJson(z.array(DateRangeSchema).min(1)).describe(
        "One or more date ranges to include in the report.",
      ),
      dimensions: fromJson(z.array(DimensionSchema))
        .optional()
        .describe(
          "Dimensions to group results by, e.g. [{ name: 'sessionSource' }].",
        ),
      metrics: fromJson(z.array(MetricSchema).min(1)).describe(
        "Metrics to aggregate, e.g. [{ name: 'activeUsers' }].",
      ),
      dimensionFilter: fromJson(FilterExpressionSchema)
        .optional()
        .describe("Optional filter to restrict dimension values."),
      metricFilter: fromJson(FilterExpressionSchema)
        .optional()
        .describe("Optional filter to restrict metric values."),
      orderBys: fromJson(z.array(OrderBySchema))
        .optional()
        .describe("Optional ordering for returned rows."),
      limit: fromJson(z.number().int().positive())
        .optional()
        .describe(
          "Maximum number of rows to return. Defaults to 10,000; max 250,000.",
        ),
      offset: fromJson(z.number().int().nonnegative())
        .optional()
        .describe(
          "Row offset for pagination (0-based). Use with limit to page through results.",
        ),
      currencyCode: z
        .string()
        .optional()
        .describe(
          "Optional ISO 4217 currency code for revenue metrics, e.g. 'USD'.",
        ),
      returnPropertyQuota: z
        .boolean()
        .optional()
        .describe(
          "If true, includes the current GA4 property quota state in the response.",
        ),
    }),
    outputSchema: RunReportOutputSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const body: Record<string, unknown> = {
          dateRanges: args.dateRanges,
          metrics: args.metrics,
        };
        if (args.dimensions !== undefined) body.dimensions = args.dimensions;
        if (args.dimensionFilter !== undefined)
          body.dimensionFilter = args.dimensionFilter;
        if (args.metricFilter !== undefined)
          body.metricFilter = args.metricFilter;
        if (args.orderBys !== undefined) body.orderBys = args.orderBys;
        if (args.limit !== undefined) body.limit = args.limit;
        if (args.offset !== undefined) body.offset = args.offset;
        if (args.currencyCode !== undefined)
          body.currencyCode = args.currencyCode;
        if (args.returnPropertyQuota !== undefined)
          body.returnPropertyQuota = args.returnPropertyQuota;
        const response = await client.runReport(args.property, body);
        return RunReportOutputSchema.parse(response);
      } catch (error) {
        throw new Error(
          `Failed to run report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

const FunnelStepSchema = z.object({
  name: z
    .string()
    .describe("Display name for this funnel step (shown in reports)."),
  filterExpression: fromJson(z.record(z.string(), z.unknown())).describe(
    "Required. Condition that qualifies users for this step. See https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FunnelStep#FunnelFilterExpression",
  ),
  isDirectlyFollowedBy: z
    .boolean()
    .optional()
    .describe(
      "If true, this step must immediately follow the previous step (no intervening events). Defaults to false.",
    ),
  withinDurationFromPriorStep: z
    .string()
    .optional()
    .describe(
      "Time window within which this step must occur after the prior step, e.g. '3600s' for 1 hour.",
    ),
});

export const runFunnelReportTool = (env: Env) =>
  createPrivateTool({
    id: "run-funnel-report",
    description:
      "Runs a Google Analytics 4 funnel report. Analyzes how users progress through a sequence of steps (e.g. landing page → product page → checkout → purchase). Returns per-step completion counts and drop-off rates.",
    inputSchema: z.object({
      property: z
        .string()
        .describe(
          "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
        ),
      funnelSteps: fromJson(z.array(FunnelStepSchema).min(2)).describe(
        "Ordered list of funnel steps. Each step is a GA4 FunnelStep object with a name and filterExpression.",
      ),
      dateRanges: fromJson(z.array(DateRangeSchema).min(1)).describe(
        "One or more date ranges to include in the report.",
      ),
      funnelBreakdown: fromJson(z.record(z.string(), z.unknown()))
        .optional()
        .describe(
          "Optional FunnelBreakdown — adds a sub-dimension to the funnel table rows.",
        ),
      funnelNextAction: fromJson(z.record(z.string(), z.unknown()))
        .optional()
        .describe(
          "Optional FunnelNextAction — adds a next-action dimension showing what users do after abandoning a step.",
        ),
      limit: fromJson(z.number().int().positive())
        .optional()
        .describe("Maximum number of rows to return."),
      offset: fromJson(z.number().int().nonnegative())
        .optional()
        .describe("Row offset for pagination."),
      returnPropertyQuota: z
        .boolean()
        .optional()
        .describe("If true, includes current GA4 property quota in response."),
    }),
    outputSchema: RunFunnelReportOutputSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const body: Record<string, unknown> = {
          funnel: { steps: args.funnelSteps },
          dateRanges: args.dateRanges,
        };
        if (args.funnelBreakdown !== undefined)
          body.funnelBreakdown = args.funnelBreakdown;
        if (args.funnelNextAction !== undefined)
          body.funnelNextAction = args.funnelNextAction;
        if (args.limit !== undefined) body.limit = args.limit;
        if (args.offset !== undefined) body.offset = args.offset;
        if (args.returnPropertyQuota !== undefined)
          body.returnPropertyQuota = args.returnPropertyQuota;
        const response = await client.runFunnelReport(args.property, body);
        return RunFunnelReportOutputSchema.parse(response);
      } catch (error) {
        throw new Error(
          `Failed to run funnel report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

export const runRealtimeReportTool = (env: Env) =>
  createPrivateTool({
    id: "run-realtime-report",
    description:
      "Runs a Google Analytics 4 realtime report. Returns live data from the last 30 minutes.",
    inputSchema: z.object({
      property: z
        .string()
        .describe(
          "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
        ),
      dimensions: fromJson(z.array(DimensionSchema))
        .optional()
        .describe("Dimensions to group results by."),
      metrics: fromJson(z.array(MetricSchema).min(1)).describe(
        "Metrics to aggregate.",
      ),
      dimensionFilter: fromJson(FilterExpressionSchema)
        .optional()
        .describe("Optional filter to restrict dimension values."),
      metricFilter: fromJson(FilterExpressionSchema)
        .optional()
        .describe("Optional filter to restrict metric values."),
      orderBys: fromJson(z.array(OrderBySchema))
        .optional()
        .describe("Optional ordering for returned rows."),
      limit: fromJson(z.number().int().positive())
        .optional()
        .describe("Maximum number of rows to return."),
      offset: fromJson(z.number().int().nonnegative())
        .optional()
        .describe("Row offset for pagination."),
      returnPropertyQuota: z
        .boolean()
        .optional()
        .describe("If true, includes quota state in the response."),
    }),
    outputSchema: RunRealtimeReportOutputSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const body: Record<string, unknown> = {
          metrics: args.metrics,
        };
        if (args.dimensions !== undefined) body.dimensions = args.dimensions;
        if (args.dimensionFilter !== undefined)
          body.dimensionFilter = args.dimensionFilter;
        if (args.metricFilter !== undefined)
          body.metricFilter = args.metricFilter;
        if (args.orderBys !== undefined) body.orderBys = args.orderBys;
        if (args.limit !== undefined) body.limit = args.limit;
        if (args.offset !== undefined) body.offset = args.offset;
        if (args.returnPropertyQuota !== undefined)
          body.returnPropertyQuota = args.returnPropertyQuota;
        const response = await client.runRealtimeReport(args.property, body);
        return RunRealtimeReportOutputSchema.parse(response);
      } catch (error) {
        throw new Error(
          `Failed to run realtime report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
