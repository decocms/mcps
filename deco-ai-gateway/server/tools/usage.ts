import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { getKeyDetails } from "../lib/openrouter-keys.ts";
import {
  estimateCreditDuration,
  estimationSummary,
  type CreditEstimation,
} from "../lib/credit-estimation.ts";
import { ensureApiKey } from "../lib/provisioning.ts";
import type { Env } from "../types/env.ts";

export const createGatewayUsageTool = (env: Env) =>
  createTool({
    id: "GATEWAY_USAGE",
    description:
      "Returns full spending and usage data for this organization's OpenRouter API key. " +
      "Includes total, daily, weekly, and monthly usage.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        key: z.object({
          name: z.string(),
          label: z.string().nullable(),
          disabled: z.boolean(),
          createdAt: z.string(),
          updatedAt: z.string().nullable(),
          expiresAt: z.string().nullable(),
        }),
        billing: z.object({
          mode: z.enum(["prepaid", "postpaid"]),
          limitPeriod: z.enum(["daily", "weekly", "monthly"]).nullable(),
        }),
        limit: z.object({
          total: z.number().nullable(),
          remaining: z.number().nullable(),
          reset: z.string().nullable(),
          includeByokInLimit: z.boolean(),
        }),
        usage: z.object({
          total: z.number(),
          daily: z.number(),
          weekly: z.number(),
          monthly: z.number(),
        }),
        byokUsage: z.object({
          total: z.number(),
          daily: z.number(),
          weekly: z.number(),
          monthly: z.number(),
        }),
        estimation: z
          .object({
            avgDailySpend: z
              .number()
              .describe("Average raw $/day based on best usage window"),
            estimatedDaysRemaining: z
              .number()
              .nullable()
              .describe("Calendar days until credit runs out"),
            estimatedDepletionDate: z
              .string()
              .nullable()
              .describe("Projected depletion date (YYYY-MM-DD)"),
            resetsBeforeDepletion: z
              .boolean()
              .describe("True if the limit resets before running out"),
            confidence: z
              .enum(["low", "medium", "high"])
              .describe("Data quality behind the estimate"),
            basedOn: z
              .enum(["monthly", "weekly", "daily"])
              .describe("Which usage window was used"),
          })
          .nullable()
          .describe(
            "Credit duration estimate (null when unlimited or no usage)",
          ),
        alert: z.object({
          enabled: z.boolean(),
          threshold_usd: z.number(),
          email: z.string().nullable(),
        }),
        connectionId: z.string(),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      if (organizationId) {
        await ensureApiKey(connectionId, organizationId, meshUrl ?? "");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "Failed to provision OpenRouter API key. Please try again.",
        );
      }

      const d = await getKeyDetails(row.openrouter_key_hash);

      const billingMode = row.billing_mode ?? "prepaid";
      const limitPeriod = (row.limit_period ?? null) as
        | "daily"
        | "weekly"
        | "monthly"
        | null;

      const estimation: CreditEstimation | null = estimateCreditDuration({
        limitRemaining: d.limit_remaining,
        limitReset: d.limit_reset,
        usageMonthly: d.usage_monthly,
        usageWeekly: d.usage_weekly,
        usageDaily: d.usage_daily,
        keyCreatedAt: d.created_at,
      });

      const percentUsed =
        d.limit != null && d.limit > 0
          ? Math.min(100, Math.round((d.usage / d.limit) * 100 * 10) / 10)
          : null;

      let summaryLines: string[];
      if (billingMode === "postpaid") {
        if (d.limit != null) {
          const periodLabel = limitPeriod ?? "no reset";
          summaryLines = [
            `Key: ${d.name} | Status: ${d.disabled ? "disabled" : "active"}`,
            `Billing: postpaid | Limit: $${d.limit.toFixed(2)} (${periodLabel})`,
            `Usage: $${d.usage.toFixed(4)} of $${d.limit.toFixed(2)} — ${percentUsed}% used`,
            `Period usage — Daily: $${d.usage_daily.toFixed(4)} | Weekly: $${d.usage_weekly.toFixed(4)} | Monthly: $${d.usage_monthly.toFixed(4)}`,
          ];
          if (d.limit_reset) {
            summaryLines.push(`Next reset: ${d.limit_reset}`);
          }
        } else {
          summaryLines = [
            `Key: ${d.name} | Status: ${d.disabled ? "disabled" : "active"}`,
            `Billing: postpaid | No spending limit configured`,
            `Usage — Total: $${d.usage.toFixed(4)} | Daily: $${d.usage_daily.toFixed(4)} | Weekly: $${d.usage_weekly.toFixed(4)} | Monthly: $${d.usage_monthly.toFixed(4)}`,
          ];
        }
      } else {
        const limitLine = d.limit
          ? `Limit: $${d.limit.toFixed(4)} | Remaining: $${(d.limit_remaining ?? 0).toFixed(4)}`
          : "Limit: none";

        let forecastLabel: string;
        if (estimation) {
          forecastLabel = estimationSummary(estimation);
        } else if (d.limit == null) {
          forecastLabel = "No spending limit set — usage is unlimited.";
        } else if ((d.limit_remaining ?? 0) <= 0) {
          forecastLabel = "Credit exhausted.";
        } else {
          forecastLabel = "No usage yet — estimation not available.";
        }

        summaryLines = [
          `Key: ${d.name} | Status: ${d.disabled ? "disabled" : "active"}`,
          `Usage — Total: $${d.usage.toFixed(6)} | Daily: $${d.usage_daily.toFixed(6)} | Weekly: $${d.usage_weekly.toFixed(6)} | Monthly: $${d.usage_monthly.toFixed(6)}`,
          limitLine,
          `Forecast: ${forecastLabel}`,
        ];
      }

      return {
        summary: summaryLines.join("\n"),
        key: {
          name: d.name,
          label: d.label,
          disabled: d.disabled,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          expiresAt: d.expires_at,
        },
        billing: {
          mode: billingMode,
          limitPeriod,
        },
        limit: {
          total: d.limit,
          remaining: d.limit_remaining,
          reset: d.limit_reset,
          includeByokInLimit: d.include_byok_in_limit,
        },
        usage: {
          total: d.usage,
          daily: d.usage_daily,
          weekly: d.usage_weekly,
          monthly: d.usage_monthly,
        },
        byokUsage: {
          total: d.byok_usage,
          daily: d.byok_usage_daily,
          weekly: d.byok_usage_weekly,
          monthly: d.byok_usage_monthly,
        },
        estimation,
        alert: {
          enabled: row.alert_enabled ?? false,
          threshold_usd: row.alert_threshold_usd ?? 10,
          email: row.alert_email ?? null,
        },
        connectionId,
      };
    },
  });

export const usageTools = [createGatewayUsageTool];
