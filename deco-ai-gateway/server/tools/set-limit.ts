import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { logger } from "../lib/logger.ts";
import type { Env } from "../types/env.ts";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

type LimitReset = "daily" | "weekly" | "monthly";

interface UpdateKeyResponse {
  data: {
    hash: string;
    name: string;
    disabled: boolean;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: string | null;
    include_byok_in_limit: boolean;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
  };
}

async function updateKeyLimit(
  hash: string,
  limit: number | null,
  limitReset: LimitReset | null,
  includeByokInLimit: boolean,
): Promise<UpdateKeyResponse["data"]> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) {
    throw new Error("OPENROUTER_MANAGEMENT_KEY env var is required");
  }

  const body: Record<string, unknown> = {
    limit,
    limit_reset: limitReset,
    include_byok_in_limit: includeByokInLimit,
  };

  logger.info("Updating OpenRouter key limit", {
    keyHash: hash,
    limit: limit ?? "none",
    limitReset: limitReset ?? "none",
    includeByokInLimit,
  });

  const response = await fetch(`${OPENROUTER_KEYS_URL}/${hash}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter responded ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as UpdateKeyResponse;
  return result.data;
}

export const createSetLimitTool = (env: Env) =>
  createTool({
    id: "GATEWAY_SET_LIMIT",
    description:
      "Sets or removes the spending limit on this organization's OpenRouter API key. " +
      "Use limit_usd to define a maximum spend in USD. " +
      "Use limit_reset to automatically restore the limit each day, week, or month. " +
      "Set limit_usd to null to remove the limit entirely.",
    inputSchema: z
      .object({
        limit_usd: z
          .number()
          .positive()
          .nullable()
          .describe(
            "Spending limit in USD. Use null to remove the limit. Examples: 10, 50.5, 100",
          ),
        limit_reset: z
          .enum(["daily", "weekly", "monthly"])
          .nullable()
          .describe(
            "When to automatically reset the limit: 'daily' (midnight UTC), 'weekly' (Monday UTC), 'monthly' (1st UTC). Use null for a one-time limit with no reset.",
          ),
        include_byok_in_limit: z
          .boolean()
          .default(false)
          .describe(
            "Whether BYOK (Bring Your Own Key) usage counts toward this limit. Default: false.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        limit: z.number().nullable(),
        limit_remaining: z.number().nullable(),
        limit_reset: z.string().nullable(),
        include_byok_in_limit: z.boolean(),
        usage_monthly: z.number(),
        connectionId: z.string(),
      })
      .strict(),
    execute: async ({ context }) => {
      const { limit_usd, limit_reset, include_byok_in_limit } = context;
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

      const updated = await updateKeyLimit(
        row.openrouter_key_hash,
        limit_usd,
        limit_reset,
        include_byok_in_limit,
      );

      logger.info("OpenRouter key limit updated", {
        connectionId,
        limit: updated.limit,
        limitReset: updated.limit_reset,
        limitRemaining: updated.limit_remaining,
      });

      const limitLine =
        updated.limit !== null
          ? `$${updated.limit.toFixed(2)}${updated.limit_reset ? `/${updated.limit_reset}` : " (one-time)"} — remaining: $${(updated.limit_remaining ?? 0).toFixed(2)}`
          : "no limit";

      const summary = [
        `Key: ${updated.name}`,
        `Limit: ${limitLine}`,
        `BYOK counts toward limit: ${updated.include_byok_in_limit ? "yes" : "no"}`,
        `Monthly usage so far: $${updated.usage_monthly.toFixed(6)}`,
      ].join(" | ");

      return {
        summary,
        limit: updated.limit,
        limit_remaining: updated.limit_remaining,
        limit_reset: updated.limit_reset,
        include_byok_in_limit: updated.include_byok_in_limit,
        usage_monthly: updated.usage_monthly,
        connectionId,
      };
    },
  });

export const setLimitTools = [createSetLimitTool];
