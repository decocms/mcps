/**
 * HyperDX Alerts Tools
 *
 * CRUD tools for managing HyperDX alert thresholds.
 * Alerts notify channels (email, Slack, PagerDuty, OpsGenie) when thresholds are breached.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createHyperDXClient } from "../lib/client.ts";
import { getHyperDXApiKey } from "../lib/env.ts";

// ============================================================================
// Shared schemas
// ============================================================================

const AlertIntervalSchema = z.enum([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "6h",
  "12h",
  "1d",
]);

const AlertChannelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    recipients: z.array(z.string()).describe("Email addresses to notify."),
  }),
  z.object({
    type: z.literal("slack"),
    channelId: z.string().describe("Slack channel ID."),
  }),
  z.object({
    type: z.literal("pagerduty"),
    severity: z
      .enum(["critical", "error", "warning", "info"])
      .describe("PagerDuty incident severity."),
  }),
  z.object({
    type: z.literal("opsgenie"),
    webhookId: z.string().describe("OpsGenie integration webhook ID."),
    priority: z
      .enum(["P0", "P1", "P2", "P3", "P4", "P5"])
      .optional()
      .describe("OpsGenie alert priority."),
  }),
  z.object({
    type: z.literal("slack_webhook"),
    webhookId: z.string().describe("Slack incoming webhook ID."),
  }),
]);

const AlertResponseSchema = z.object({
  id: z.string(),
  interval: AlertIntervalSchema,
  threshold: z.number(),
  threshold_type: z.enum(["above", "below"]),
  source: z.enum(["chart", "search"]),
  name: z.string().optional(),
  message: z.string().optional(),
  dashboardId: z.string().optional(),
  chartId: z.string().optional(),
  savedSearchId: z.string().optional(),
  groupBy: z.string().optional(),
});

// ============================================================================
// LIST_ALERTS
// ============================================================================

export const createListAlertsTool = (_env: Env) =>
  createTool({
    id: "LIST_ALERTS",
    description:
      "List all alerts configured for the team in HyperDX. Returns alert thresholds, channels, intervals, and whether they are chart-based or search-based.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      alerts: z.array(z.record(z.string(), z.unknown())),
      total: z.number(),
    }),
    execute: async ({ runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      const response = await client.listAlerts();
      const alerts = response.data ?? [];
      return { alerts, total: alerts.length };
    },
  });

// ============================================================================
// GET_ALERT
// ============================================================================

export const createGetAlertTool = (_env: Env) =>
  createTool({
    id: "GET_ALERT",
    description: "Get details of a specific HyperDX alert by its ID.",
    inputSchema: z.object({
      id: z.string().describe("The alert ID to retrieve."),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.getAlert(context.id);
    },
  });

// ============================================================================
// CREATE_ALERT
// ============================================================================

export const createCreateAlertTool = (_env: Env) =>
  createTool({
    id: "CREATE_ALERT",
    description:
      "Create a new alert in HyperDX. Alerts fire when a metric crosses a threshold and notify a channel (email, Slack, PagerDuty, OpsGenie, or Slack webhook). Can be attached to a saved search or a dashboard chart.",
    inputSchema: z.object({
      interval: AlertIntervalSchema.describe(
        "How often to evaluate the alert condition.",
      ),
      threshold: z
        .number()
        .describe("Numeric threshold value that triggers the alert."),
      threshold_type: z
        .enum(["above", "below"])
        .describe("Fire when the value is 'above' or 'below' the threshold."),
      source: z
        .enum(["chart", "search"])
        .describe(
          "Alert source type. 'chart' requires dashboardId+chartId, 'search' requires savedSearchId.",
        ),
      channel: AlertChannelSchema.describe(
        "Notification channel configuration.",
      ),
      name: z.string().optional().describe("Human-readable alert name."),
      message: z
        .string()
        .optional()
        .describe("Custom message included in the notification."),
      dashboardId: z
        .string()
        .optional()
        .describe("Dashboard ID (required when source='chart')."),
      chartId: z
        .string()
        .optional()
        .describe(
          "Chart ID within the dashboard (required when source='chart').",
        ),
      savedSearchId: z
        .string()
        .optional()
        .describe("Saved search ID (required when source='search')."),
      groupBy: z
        .string()
        .optional()
        .describe(
          "Field to group search results by before applying threshold (for source='search').",
        ),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.createAlert(context as Record<string, unknown>);
    },
  });

// ============================================================================
// UPDATE_ALERT
// ============================================================================

export const createUpdateAlertTool = (_env: Env) =>
  createTool({
    id: "UPDATE_ALERT",
    description:
      "Update an existing HyperDX alert. Provide only the fields you want to change alongside the alert ID.",
    inputSchema: z.object({
      id: z.string().describe("The alert ID to update."),
      interval: AlertIntervalSchema.optional(),
      threshold: z.number().optional(),
      threshold_type: z.enum(["above", "below"]).optional(),
      source: z.enum(["chart", "search"]).optional(),
      channel: AlertChannelSchema.optional(),
      name: z.string().optional(),
      message: z.string().optional(),
      dashboardId: z.string().optional(),
      chartId: z.string().optional(),
      savedSearchId: z.string().optional(),
      groupBy: z.string().optional(),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      const { id, ...body } = context;
      return client.updateAlert(id, body as Record<string, unknown>);
    },
  });

// ============================================================================
// DELETE_ALERT
// ============================================================================

export const createDeleteAlertTool = (_env: Env) =>
  createTool({
    id: "DELETE_ALERT",
    description: "Permanently delete a HyperDX alert by its ID.",
    inputSchema: z.object({
      id: z.string().describe("The alert ID to delete."),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getHyperDXApiKey(runtimeContext.env as Env);
      const client = createHyperDXClient({ apiKey });
      return client.deleteAlert(context.id);
    },
  });

export const alertTools = [
  createListAlertsTool,
  createGetAlertTool,
  createCreateAlertTool,
  createUpdateAlertTool,
  createDeleteAlertTool,
];
