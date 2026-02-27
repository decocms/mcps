import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import type { Env } from "../types/env.ts";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

/**
 * Full response schema from GET /api/v1/keys/:hash
 * @see https://openrouter.ai/docs/api/api-reference/api-keys/get-key
 */
interface OpenRouterKeyDetails {
  data: {
    hash: string;
    name: string;
    label: string | null;
    disabled: boolean;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: string | null;
    include_byok_in_limit: boolean;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
    byok_usage: number;
    byok_usage_daily: number;
    byok_usage_weekly: number;
    byok_usage_monthly: number;
    created_at: string;
    updated_at: string | null;
    expires_at: string | null;
  };
}

async function getKeyUsage(
  hash: string,
): Promise<OpenRouterKeyDetails["data"]> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) {
    throw new Error("OPENROUTER_MANAGEMENT_KEY env var is required");
  }

  const response = await fetch(`${OPENROUTER_KEYS_URL}/${hash}`, {
    headers: { Authorization: `Bearer ${managementKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter responded ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as OpenRouterKeyDetails;
  return result.data;
}

export const createGatewayUsageTool = (env: Env) =>
  createTool({
    id: "GATEWAY_USAGE",
    description:
      "Returns full spending and usage data for this organization's OpenRouter API key. Includes total, daily, weekly, and monthly usage for both OpenRouter credits and BYOK (Bring Your Own Key) external usage. Useful for monitoring LLM costs per organization.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        key: z.object({
          hash: z.string(),
          name: z.string(),
          label: z.string().nullable(),
          disabled: z.boolean(),
          createdAt: z.string(),
          updatedAt: z.string().nullable(),
          expiresAt: z.string().nullable(),
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

      const d = await getKeyUsage(row.openrouter_key_hash);

      const limitLine = d.limit
        ? `Limit: $${d.limit.toFixed(4)} | Remaining: $${(d.limit_remaining ?? 0).toFixed(4)} | Reset: ${d.limit_reset ?? "none"}`
        : "Limit: none";

      const summary = [
        `Key: ${d.name}`,
        `Status: ${d.disabled ? "disabled" : "active"}`,
        `Usage — Total: $${d.usage.toFixed(6)} | Daily: $${d.usage_daily.toFixed(6)} | Weekly: $${d.usage_weekly.toFixed(6)} | Monthly: $${d.usage_monthly.toFixed(6)}`,
        `BYOK — Total: $${d.byok_usage.toFixed(6)} | Daily: $${d.byok_usage_daily.toFixed(6)} | Weekly: $${d.byok_usage_weekly.toFixed(6)} | Monthly: $${d.byok_usage_monthly.toFixed(6)}`,
        limitLine,
      ].join("\n");

      return {
        summary,
        key: {
          hash: d.hash,
          name: d.name,
          label: d.label,
          disabled: d.disabled,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          expiresAt: d.expires_at,
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
        connectionId,
      };
    },
  });

export const usageTools = [createGatewayUsageTool];
