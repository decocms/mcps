import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { getKeyDetails } from "../lib/openrouter-keys.ts";
import { DEFAULT_LIMIT_USD } from "../lib/constants.ts";
import type { Env } from "../types/env.ts";

export const createGatewayCreditsTool = (env: Env) =>
  createTool({
    id: "GATEWAY_CREDITS",
    description:
      "Returns the available credit balance for this organization's AI Gateway. " +
      "Use this to check how much credit remains before making LLM calls.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        available: z
          .number()
          .nullable()
          .describe("Remaining credit balance in USD (null = unlimited)"),
        total: z
          .number()
          .nullable()
          .describe("Total credit limit in USD (null = unlimited)"),
        used: z.number().describe("Total amount spent in USD"),
        billingMode: z
          .enum(["prepaid", "postpaid"])
          .describe("Billing mode for this organization"),
        keyDisabled: z.boolean().describe("Whether the API key is disabled"),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        return {
          available: DEFAULT_LIMIT_USD,
          total: DEFAULT_LIMIT_USD,
          used: 0,
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
      const markupPct = row.usage_markup_pct ?? 0;
      const applyMarkup = (v: number) => v * (1 + markupPct / 100);

      return {
        available: d.limit_remaining,
        total: d.limit,
        used: applyMarkup(d.usage),
        billingMode,
        keyDisabled: d.disabled,
      };
    },
  });

export const creditsTools = [createGatewayCreditsTool];
