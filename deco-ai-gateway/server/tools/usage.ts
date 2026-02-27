import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { getKeyDetails } from "../lib/openrouter-keys.ts";
import type { Env } from "../types/env.ts";

function applyMarkup(value: number, markupPct: number): number {
  return value * (1 + markupPct / 100);
}

export const createGatewayUsageTool = (env: Env) =>
  createTool({
    id: "GATEWAY_USAGE",
    description:
      "Returns full spending and usage data for this organization's OpenRouter API key. " +
      "Includes total, daily, weekly, and monthly usage. " +
      "If a usage markup is configured, shows both raw LLM cost and effective cost with markup.",
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
          markupPct: z.number(),
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
        effectiveCost: z.object({
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
        connectionId: z.string(),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "No OpenRouter key provisioned yet. Make an LLM call first to trigger automatic provisioning.",
        );
      }

      const d = await getKeyDetails(row.openrouter_key_hash);

      const billingMode = row.billing_mode ?? "prepaid";
      const markupPct = row.usage_markup_pct ?? 0;

      const limitLine = d.limit
        ? `Limit: $${d.limit.toFixed(4)} | Remaining: $${(d.limit_remaining ?? 0).toFixed(4)} | Reset: ${d.limit_reset ?? "none"}`
        : "Limit: none";

      const lines = [
        `Key: ${d.name}`,
        `Status: ${d.disabled ? "disabled" : "active"}`,
        `Billing: ${billingMode}${markupPct > 0 ? ` (+${markupPct}% markup)` : ""}`,
        `Usage (raw) — Total: $${d.usage.toFixed(6)} | Daily: $${d.usage_daily.toFixed(6)} | Weekly: $${d.usage_weekly.toFixed(6)} | Monthly: $${d.usage_monthly.toFixed(6)}`,
      ];

      if (markupPct > 0) {
        lines.push(
          `Usage (with ${markupPct}% markup) — Total: $${applyMarkup(d.usage, markupPct).toFixed(6)} | Monthly: $${applyMarkup(d.usage_monthly, markupPct).toFixed(6)}`,
        );
      }

      lines.push(
        `BYOK — Total: $${d.byok_usage.toFixed(6)} | Daily: $${d.byok_usage_daily.toFixed(6)} | Weekly: $${d.byok_usage_weekly.toFixed(6)} | Monthly: $${d.byok_usage_monthly.toFixed(6)}`,
        limitLine,
      );

      return {
        summary: lines.join("\n"),
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
          markupPct,
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
        effectiveCost: {
          total: applyMarkup(d.usage, markupPct),
          daily: applyMarkup(d.usage_daily, markupPct),
          weekly: applyMarkup(d.usage_weekly, markupPct),
          monthly: applyMarkup(d.usage_monthly, markupPct),
        },
        byokUsage: {
          total: d.byok_usage,
          daily: d.byok_usage_daily,
          weekly: d.byok_usage_weekly,
          monthly: d.byok_usage_monthly,
        },
        connectionId,
      };
    },
  });

export const usageTools = [createGatewayUsageTool];
