/**
 * Reporting Tools
 *
 * Tools for running reports and analyzing Google Analytics data
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { AnalyticsClient, getAccessToken } from "../lib/analytics-client.ts";
import { COMMON_DIMENSIONS, COMMON_METRICS } from "../constants.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const DateRangeSchema = z.object({
  startDate: z
    .string()
    .describe(
      "Start date (YYYY-MM-DD format or relative like 'today', '7daysAgo', '30daysAgo')",
    ),
  endDate: z
    .string()
    .describe(
      "End date (YYYY-MM-DD format or relative like 'today', 'yesterday')",
    ),
  name: z
    .string()
    .optional()
    .describe("Optional name for this date range (useful for comparisons)"),
});

const OrderBySchema = z.object({
  desc: z.boolean().optional().describe("Sort descending (default: false)"),
  dimension: z
    .object({
      dimensionName: z.string().describe("Dimension name to sort by"),
      orderType: z
        .enum(["ALPHANUMERIC", "CASE_INSENSITIVE_ALPHANUMERIC", "NUMERIC"])
        .optional()
        .describe("How to sort the dimension values"),
    })
    .optional()
    .describe("Sort by dimension"),
  metric: z
    .object({
      metricName: z.string().describe("Metric name to sort by"),
    })
    .optional()
    .describe("Sort by metric"),
});

// ============================================================================
// Run Report Tool
// ============================================================================

export const createRunReportTool = (env: Env) =>
  createPrivateTool({
    id: "ga_run_report",
    description: `Run a report on Google Analytics 4 data. This is the main tool for analyzing your GA4 data with custom dimensions, metrics, and date ranges.

Common Use Cases:
- Traffic analysis: page views, users, sessions by date, country, device
- User behavior: engagement rate, bounce rate, session duration
- Content performance: top pages by views, conversions, revenue
- Acquisition: traffic sources, campaigns, referrals
- E-commerce: revenue, conversions, transactions

Common Dimensions: ${Object.values(COMMON_DIMENSIONS).join(", ")}

Common Metrics: ${Object.values(COMMON_METRICS).join(", ")}

Example: Get daily active users for last 7 days
- dateRanges: [{ startDate: "7daysAgo", endDate: "today" }]
- dimensions: ["date"]
- metrics: ["activeUsers", "sessions"]`,
    inputSchema: z.object({
      propertyId: z
        .string()
        .describe("GA4 Property ID (numeric ID like '123456789')"),
      dateRanges: z
        .array(DateRangeSchema)
        .min(1)
        .describe(
          "Date ranges to query (e.g., [{ startDate: '7daysAgo', endDate: 'today' }])",
        ),
      dimensions: z
        .array(z.string())
        .optional()
        .describe(
          "Dimensions to group by (e.g., ['date', 'country', 'deviceCategory'])",
        ),
      metrics: z
        .array(z.string())
        .min(1)
        .describe(
          "Metrics to retrieve (e.g., ['activeUsers', 'sessions', 'screenPageViews'])",
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .optional()
        .describe(
          "Maximum number of rows to return (default: 1000, max: 100000)",
        ),
      offset: z.coerce
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of rows to skip for pagination (default: 0)"),
      orderBys: z
        .array(OrderBySchema)
        .optional()
        .describe("How to sort the results (e.g., by dimension or metric)"),
      keepEmptyRows: z
        .boolean()
        .optional()
        .describe("Include rows with zero values (default: false)"),
    }),
    outputSchema: z.object({
      report: z.object({
        dimensionHeaders: z
          .array(
            z.object({
              name: z.string().describe("Dimension name"),
            }),
          )
          .optional()
          .describe("Headers for dimensions in the report"),
        metricHeaders: z
          .array(
            z.object({
              name: z.string().describe("Metric name"),
              type: z
                .string()
                .describe("Data type (e.g., TYPE_INTEGER, TYPE_FLOAT)"),
            }),
          )
          .optional()
          .describe("Headers for metrics in the report"),
        rows: z
          .array(
            z.object({
              dimensionValues: z
                .array(
                  z.object({
                    value: z.string().optional().describe("Dimension value"),
                  }),
                )
                .optional()
                .describe("Values for each dimension"),
              metricValues: z
                .array(
                  z.object({
                    value: z.string().optional().describe("Metric value"),
                  }),
                )
                .optional()
                .describe("Values for each metric"),
            }),
          )
          .optional()
          .describe("Data rows in the report"),
        totals: z
          .array(z.any())
          .optional()
          .describe("Total row (sum of all rows)"),
        rowCount: z.number().optional().describe("Total number of rows"),
        metadata: z
          .object({
            currencyCode: z.string().optional().describe("Currency code used"),
            timeZone: z
              .string()
              .optional()
              .describe("Timezone of the property"),
          })
          .optional()
          .describe("Report metadata"),
      }),
      summary: z.object({
        totalRows: z.number().describe("Number of rows returned"),
        dimensions: z.array(z.string()).describe("Dimensions requested"),
        metrics: z.array(z.string()).describe("Metrics requested"),
        dateRanges: z
          .array(
            z.object({
              startDate: z.string(),
              endDate: z.string(),
            }),
          )
          .describe("Date ranges queried"),
      }),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      // Ensure property ID is in the correct format (numeric only)
      const propertyId = context.propertyId.startsWith("properties/")
        ? context.propertyId
        : `properties/${context.propertyId}`;

      const report = await client.runReport({
        propertyId,
        dateRanges: context.dateRanges,
        dimensions: context.dimensions,
        metrics: context.metrics,
        limit: context.limit || 1000,
        offset: context.offset,
        orderBys: context.orderBys,
        keepEmptyRows: context.keepEmptyRows,
        returnPropertyQuota: true,
      });

      return {
        report: {
          dimensionHeaders: report.dimensionHeaders,
          metricHeaders: report.metricHeaders,
          rows: report.rows,
          totals: report.totals,
          rowCount: report.rowCount,
          metadata: report.metadata,
        },
        summary: {
          totalRows: report.rowCount || 0,
          dimensions: context.dimensions || [],
          metrics: context.metrics,
          dateRanges: context.dateRanges.map((dr) => ({
            startDate: dr.startDate,
            endDate: dr.endDate,
          })),
        },
      };
    },
  });

// ============================================================================
// Run Realtime Report Tool
// ============================================================================

export const createRunRealtimeReportTool = (env: Env) =>
  createPrivateTool({
    id: "ga_run_realtime_report",
    description: `Run a realtime report on Google Analytics 4 data showing activity from the last 30 minutes. Perfect for monitoring live traffic and user behavior.

Common Use Cases:
- Current active users on site
- Real-time page views and events
- Live traffic sources and locations
- Active user demographics and devices

Common Dimensions: ${Object.values(COMMON_DIMENSIONS).slice(0, 10).join(", ")}

Common Metrics: activeUsers, screenPageViews, eventCount, conversions

Example: Get active users by country right now
- dimensions: ["country"]
- metrics: ["activeUsers"]`,
    inputSchema: z.object({
      propertyId: z
        .string()
        .describe("GA4 Property ID (numeric ID like '123456789')"),
      dimensions: z
        .array(z.string())
        .optional()
        .describe(
          "Dimensions to group by (e.g., ['country', 'deviceCategory', 'pagePath'])",
        ),
      metrics: z
        .array(z.string())
        .min(1)
        .describe(
          "Metrics to retrieve (e.g., ['activeUsers', 'screenPageViews', 'eventCount'])",
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .optional()
        .describe(
          "Maximum number of rows to return (default: 100, max: 100000)",
        ),
      orderBys: z
        .array(OrderBySchema)
        .optional()
        .describe("How to sort the results"),
      minuteRanges: z
        .array(
          z.object({
            startMinutesAgo: z
              .number()
              .int()
              .optional()
              .describe("Start of minute range (e.g., 29 for last 30 minutes)"),
            endMinutesAgo: z
              .number()
              .int()
              .optional()
              .describe("End of minute range (e.g., 0 for now)"),
            name: z.string().optional().describe("Name for this time range"),
          }),
        )
        .optional()
        .describe("Minute ranges to query (default: last 30 minutes)"),
    }),
    outputSchema: z.object({
      report: z.object({
        dimensionHeaders: z
          .array(
            z.object({
              name: z.string().describe("Dimension name"),
            }),
          )
          .optional()
          .describe("Headers for dimensions"),
        metricHeaders: z
          .array(
            z.object({
              name: z.string().describe("Metric name"),
              type: z.string().describe("Data type"),
            }),
          )
          .optional()
          .describe("Headers for metrics"),
        rows: z
          .array(
            z.object({
              dimensionValues: z
                .array(
                  z.object({
                    value: z.string().optional(),
                  }),
                )
                .optional(),
              metricValues: z
                .array(
                  z.object({
                    value: z.string().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional()
          .describe("Realtime data rows"),
        totals: z.array(z.any()).optional().describe("Total row"),
        rowCount: z.number().optional().describe("Number of rows"),
      }),
      summary: z.object({
        totalRows: z.number().describe("Number of rows returned"),
        dimensions: z.array(z.string()).describe("Dimensions requested"),
        metrics: z.array(z.string()).describe("Metrics requested"),
        timeRange: z
          .string()
          .describe("Time range covered (e.g., 'Last 30 minutes')"),
      }),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      // Ensure property ID is in the correct format
      const propertyId = context.propertyId.startsWith("properties/")
        ? context.propertyId
        : `properties/${context.propertyId}`;

      const report = await client.runRealtimeReport({
        propertyId,
        dimensions: context.dimensions,
        metrics: context.metrics,
        limit: context.limit || 100,
        orderBys: context.orderBys,
        minuteRanges: context.minuteRanges,
      });

      return {
        report: {
          dimensionHeaders: report.dimensionHeaders,
          metricHeaders: report.metricHeaders,
          rows: report.rows,
          totals: report.totals,
          rowCount: report.rowCount,
        },
        summary: {
          totalRows: report.rowCount || 0,
          dimensions: context.dimensions || [],
          metrics: context.metrics,
          timeRange: context.minuteRanges?.[0]
            ? `Last ${(context.minuteRanges[0].startMinutesAgo || 30) + 1} minutes`
            : "Last 30 minutes",
        },
      };
    },
  });

// ============================================================================
// Get Common Report Tool (Simplified)
// ============================================================================

export const createGetCommonReportTool = (env: Env) =>
  createPrivateTool({
    id: "ga_get_common_report",
    description: `Get a pre-configured common report. This is a simplified way to get frequently requested analytics data without specifying dimensions and metrics manually.

Available Reports:
- overview: High-level summary (users, sessions, engagement)
- traffic_sources: Where users come from (source, medium, campaign)
- page_performance: Top pages by views and engagement
- geo: Traffic by country and city
- devices: Users by device category, browser, OS
- events: Top events and conversions
- realtime: Current active users by location and page`,
    inputSchema: z.object({
      propertyId: z.string().describe("GA4 Property ID"),
      reportType: z
        .enum([
          "overview",
          "traffic_sources",
          "page_performance",
          "geo",
          "devices",
          "events",
          "realtime",
        ])
        .describe("Type of report to generate"),
      dateRange: z
        .enum(["today", "yesterday", "last7days", "last30days", "last90days"])
        .optional()
        .describe(
          "Date range preset (default: last7days, not used for realtime)",
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum rows (default: 10)"),
    }),
    outputSchema: z.object({
      report: z.any().describe("Report data"),
      summary: z.object({
        reportType: z.string(),
        totalRows: z.number(),
        dateRange: z.string().optional(),
      }),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      const propertyId = context.propertyId.startsWith("properties/")
        ? context.propertyId
        : `properties/${context.propertyId}`;

      const limit = context.limit || 10;

      // Map date range presets to GA4 format
      const dateRangeMap: Record<
        string,
        { startDate: string; endDate: string }
      > = {
        today: { startDate: "today", endDate: "today" },
        yesterday: { startDate: "yesterday", endDate: "yesterday" },
        last7days: { startDate: "7daysAgo", endDate: "today" },
        last30days: { startDate: "30daysAgo", endDate: "today" },
        last90days: { startDate: "90daysAgo", endDate: "today" },
      };

      const dateRange = dateRangeMap[context.dateRange || "last7days"];

      // Define report configurations
      const reportConfigs: Record<string, any> = {
        overview: {
          dateRanges: [dateRange],
          dimensions: ["date"],
          metrics: [
            "activeUsers",
            "sessions",
            "engagementRate",
            "screenPageViews",
          ],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
        traffic_sources: {
          dateRanges: [dateRange],
          dimensions: ["sessionSource", "sessionMedium"],
          metrics: ["sessions", "activeUsers", "engagementRate"],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        },
        page_performance: {
          dateRanges: [dateRange],
          dimensions: ["pagePath", "pageTitle"],
          metrics: ["screenPageViews", "activeUsers", "averageSessionDuration"],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        },
        geo: {
          dateRanges: [dateRange],
          dimensions: ["country", "city"],
          metrics: ["activeUsers", "sessions"],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        },
        devices: {
          dateRanges: [dateRange],
          dimensions: ["deviceCategory", "browser", "operatingSystem"],
          metrics: ["activeUsers", "sessions"],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        },
        events: {
          dateRanges: [dateRange],
          dimensions: ["eventName"],
          metrics: ["eventCount", "conversions"],
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        },
      };

      let report: any;
      let summary: any;

      if (context.reportType === "realtime") {
        // Realtime report uses different API
        report = await client.runRealtimeReport({
          propertyId,
          dimensions: ["country", "city", "pagePath"],
          metrics: ["activeUsers"],
          limit,
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        });

        summary = {
          reportType: context.reportType,
          totalRows: report.rowCount || 0,
          dateRange: "Last 30 minutes",
        };
      } else {
        const config = reportConfigs[context.reportType];
        report = await client.runReport({
          propertyId,
          ...config,
          limit,
        });

        summary = {
          reportType: context.reportType,
          totalRows: report.rowCount || 0,
          dateRange: `${dateRange.startDate} to ${dateRange.endDate}`,
        };
      }

      return {
        report,
        summary,
      };
    },
  });

// ============================================================================
// Export all report tools
// ============================================================================

export const reportTools = [
  createRunReportTool,
  createRunRealtimeReportTool,
  createGetCommonReportTool,
];
