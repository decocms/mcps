/**
 * HyperDX Dashboards Tools
 *
 * CRUD tools for managing HyperDX dashboards and their charts.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createHyperDXClient } from "../lib/client.ts";
import { getHyperDXApiKey } from "../lib/env.ts";

// ============================================================================
// Shared schemas
// ============================================================================

const DashboardAggFnSchema = z.enum([
  "avg",
  "avg_rate",
  "count",
  "count_distinct",
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
]);

const DashboardSeriesSchema = z.object({
  type: z
    .string()
    .optional()
    .describe("Chart display type (e.g., 'line', 'bar', 'number')."),
  dataSource: z
    .enum(["events", "metrics"])
    .describe(
      "'events' for logs/spans, 'metrics' for infrastructure/app metrics.",
    ),
  aggFn: DashboardAggFnSchema.describe("Aggregation function."),
  field: z.string().optional().describe("Field to aggregate."),
  where: z.string().describe("Search filter query."),
  groupBy: z.array(z.string()).describe("Fields to group by."),
  metricDataType: z
    .enum(["Sum", "Gauge", "Histogram"])
    .optional()
    .describe("Metric data type (required when dataSource='metrics')."),
});

const DashboardChartSchema = z.object({
  id: z.string().optional().describe("Chart ID (auto-generated on create)."),
  name: z.string().describe("Chart display name."),
  x: z.number().describe("Grid column position (0-based)."),
  y: z.number().describe("Grid row position (0-based)."),
  w: z.number().describe("Width in grid units."),
  h: z.number().describe("Height in grid units."),
  series: z
    .array(DashboardSeriesSchema)
    .describe("Data series for this chart (up to 5)."),
});

// ============================================================================
// LIST_DASHBOARDS
// ============================================================================

export const createListDashboardsTool = (_env: Env) =>
  createTool({
    id: "LIST_DASHBOARDS",
    description:
      "List all HyperDX dashboards for the team. Returns dashboard names, IDs, tags, and their chart configurations.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      dashboards: z.array(z.record(z.string(), z.unknown())),
      total: z.number(),
    }),
    execute: async ({ runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      const response = await client.listDashboards();
      const dashboards = response.data ?? [];
      return { dashboards, total: dashboards.length };
    },
  });

// ============================================================================
// GET_DASHBOARD
// ============================================================================

export const createGetDashboardTool = (_env: Env) =>
  createTool({
    id: "GET_DASHBOARD",
    description:
      "Get the full configuration of a HyperDX dashboard by ID, including all charts and their series definitions.",
    inputSchema: z.object({
      id: z.string().describe("Dashboard ID to retrieve."),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.getDashboard(context.id);
    },
  });

// ============================================================================
// CREATE_DASHBOARD
// ============================================================================

export const createCreateDashboardTool = (_env: Env) =>
  createTool({
    id: "CREATE_DASHBOARD",
    description:
      "Create a new HyperDX dashboard with charts. Each chart has a grid position (x, y, w, h) and up to 5 data series. Use this to build observability dashboards for services, infrastructure, or business metrics.",
    inputSchema: z.object({
      name: z.string().describe("Dashboard display name."),
      query: z
        .string()
        .optional()
        .default("")
        .describe(
          "Global filter applied to all charts on the dashboard (e.g., 'env:production').",
        ),
      tags: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Organizational tags for the dashboard."),
      charts: z
        .array(DashboardChartSchema)
        .describe(
          "Array of charts to include. Each chart needs a name, grid position (x/y/w/h), and series. Charts are placed on a grid — typical width is 12 units total.",
        ),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.createDashboard(context as Record<string, unknown>);
    },
  });

// ============================================================================
// UPDATE_DASHBOARD
// ============================================================================

export const createUpdateDashboardTool = (_env: Env) =>
  createTool({
    id: "UPDATE_DASHBOARD",
    description:
      "Update an existing HyperDX dashboard. You must provide the full updated configuration (name, query, charts) as this is a full replace operation.",
    inputSchema: z.object({
      id: z.string().describe("Dashboard ID to update."),
      name: z.string().describe("Dashboard display name."),
      query: z
        .string()
        .optional()
        .default("")
        .describe("Global filter applied to all charts."),
      tags: z.array(z.string()).optional().default([]),
      charts: z
        .array(DashboardChartSchema)
        .describe("Full replacement chart array."),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      const { id, ...body } = context;
      return client.updateDashboard(id, body as Record<string, unknown>);
    },
  });

// ============================================================================
// DELETE_DASHBOARD
// ============================================================================

export const createDeleteDashboardTool = (_env: Env) =>
  createTool({
    id: "DELETE_DASHBOARD",
    description: "Permanently delete a HyperDX dashboard by its ID.",
    inputSchema: z.object({
      id: z.string().describe("Dashboard ID to delete."),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.deleteDashboard(context.id);
    },
  });

export const dashboardTools = [
  createListDashboardsTool,
  createGetDashboardTool,
  createCreateDashboardTool,
  createUpdateDashboardTool,
  createDeleteDashboardTool,
];
