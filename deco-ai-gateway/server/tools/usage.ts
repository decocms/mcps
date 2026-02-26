import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import type { Env } from "../types/env.ts";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

interface OpenRouterKeyDetails {
  data: {
    hash: string;
    name: string;
    label: string | null;
    disabled: boolean;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: string | null;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
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
      "Retorna o gasto atual da chave OpenRouter desta organização: total acumulado, diário, semanal e mensal. Útil para monitorar custos de LLM por organização.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        usage: z.object({
          total: z.number(),
          daily: z.number(),
          weekly: z.number(),
          monthly: z.number(),
        }),
        limit: z.object({
          total: z.number(),
          remaining: z.number(),
        }),
        key: z.object({
          hash: z.string(),
          createdAt: z.string(),
          disabled: z.boolean(),
        }),
        connectionId: z.string(),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId não encontrado no contexto.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "Nenhuma chave OpenRouter provisionada ainda. Faça uma chamada LLM primeiro para provisionar automaticamente.",
        );
      }

      const usage = await getKeyUsage(row.openrouter_key_hash);

      const result = {
        summary: [
          `Key: ${row.openrouter_key_name ?? connectionId}`,
          `Total: $${usage.usage.toFixed(6)}`,
          `Daily: $${usage.usage_daily.toFixed(6)}`,
          `Weekly: $${usage.usage_weekly.toFixed(6)}`,
          `Monthly: $${usage.usage_monthly.toFixed(6)}`,
          usage.limit
            ? `Limit: $${usage.limit.toFixed(4)} (remaining: $${(usage.limit_remaining ?? 0).toFixed(4)})`
            : "Limit: none",
          `Status: ${usage.disabled ? "disabled" : "active"}`,
        ].join(" | "),
        usage: {
          total: usage.usage,
          daily: usage.usage_daily,
          weekly: usage.usage_weekly,
          monthly: usage.usage_monthly,
        },
        limit: {
          total: usage.limit ?? 0,
          remaining: usage.limit_remaining ?? 0,
        },
        key: {
          hash: usage.hash,
          createdAt: usage.created_at,
          disabled: usage.disabled,
        },
        connectionId: connectionId,
      };

      return result;
    },
  });

export const usageTools = [createGatewayUsageTool];
