import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { getKeyDetails } from "../lib/openrouter-keys.ts";
import { DEFAULT_LIMIT_USD } from "../lib/constants.ts";
import { ensureApiKey } from "../lib/provisioning.ts";
import type { Env } from "../types/env.ts";

export const createGatewayCreditsTool = (env: Env) =>
  createTool({
    id: "GATEWAY_CREDITS",
    description:
      "Returns the current balance or usage for this organization's AI Gateway. " +
      "For prepaid mode: shows available credit. " +
      "For postpaid mode: shows usage vs limit (if set) or raw usage.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        available: z
          .number()
          .nullable()
          .describe(
            "Remaining credit in USD (prepaid) or remaining limit headroom (postpaid with limit). Null = unlimited.",
          ),
        total: z
          .number()
          .nullable()
          .describe("Total credit/limit in USD (null = unlimited)"),
        used: z.number().describe("Total amount spent in USD"),
        percentUsed: z
          .number()
          .nullable()
          .describe(
            "Percentage of limit used (0-100). Null when no limit is set.",
          ),
        limitPeriod: z
          .enum(["daily", "weekly", "monthly"])
          .nullable()
          .describe("Reset period for the limit (null = no reset / wallet)"),
        billingMode: z
          .enum(["prepaid", "postpaid"])
          .describe("Billing mode for this organization"),
        keyDisabled: z.boolean().describe("Whether the API key is disabled"),
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
        return {
          available: DEFAULT_LIMIT_USD,
          total: DEFAULT_LIMIT_USD,
          used: 0,
          percentUsed: 0,
          limitPeriod: null,
          billingMode: (row?.billing_mode ?? "prepaid") as
            | "prepaid"
            | "postpaid",
          keyDisabled: false,
        };
      }

      const d = await getKeyDetails(row.openrouter_key_hash);
      const billingMode = (row.billing_mode ?? "prepaid") as
        | "prepaid"
        | "postpaid";
      const limitPeriod = (row.limit_period ?? null) as
        | "daily"
        | "weekly"
        | "monthly"
        | null;

      const percentUsed =
        d.limit != null && d.limit > 0
          ? Math.min(100, Math.round((d.usage / d.limit) * 100 * 10) / 10)
          : null;

      return {
        available: d.limit_remaining,
        total: d.limit,
        used: d.usage,
        percentUsed,
        limitPeriod,
        billingMode,
        keyDisabled: d.disabled,
      };
    },
  });

export const creditsTools = [createGatewayCreditsTool];
