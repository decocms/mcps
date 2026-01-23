/**
 * OpenRouter MCP Server
 *
 * This MCP provides tools for interacting with OpenRouter's API,
 * including model discovery, comparison, and AI chat completions.
 *
 * OpenRouter offers a unified API for accessing hundreds of AI models
 * with built-in fallback mechanisms, cost optimization, and provider routing.
 */
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "@decocms/openrouter/tools";
import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import { calculatePreAuthAmount, toMicrodollars } from "./usage";

export const StateSchema = z.object({
  WALLET: BindingOf("@deco/wallet"),
});

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

interface OpenRouterUsageReport {
  providerMetadata: {
    openrouter: {
      usage: {
        cost: number;
      };
    };
  };
}
const isOpenRouterUsageReport = (
  usage: unknown | OpenRouterUsageReport,
): usage is OpenRouterUsageReport => {
  return (
    typeof usage === "object" &&
    usage !== null &&
    "providerMetadata" in usage &&
    typeof usage.providerMetadata === "object" &&
    usage.providerMetadata !== null &&
    "openrouter" in usage.providerMetadata &&
    typeof usage.providerMetadata.openrouter === "object" &&
    usage.providerMetadata.openrouter !== null &&
    "usage" in usage.providerMetadata.openrouter &&
    typeof usage.providerMetadata.openrouter.usage === "object" &&
    usage.providerMetadata.openrouter.usage !== null &&
    "cost" in usage.providerMetadata.openrouter.usage
  );
};

const runtime = withRuntime<
  DefaultEnv<typeof StateSchema, Registry>,
  typeof StateSchema,
  Registry
>({
  tools: (env) => {
    // @ts-expect-error: TODO: fix this later
    return tools(env, {
      start: async (modelInfo, params) => {
        const amount = calculatePreAuthAmount(modelInfo, params);

        const { id } =
          await env.MESH_REQUEST_CONTEXT.state.WALLET.PRE_AUTHORIZE_AMOUNT({
            amount,
            metadata: {
              modelId: modelInfo.id,
              params: params,
            },
          }).catch((err) => {
            console.error("WALLET ERROR", err);
            return {
              id: undefined,
            };
          });
        return {
          end: async (usage) => {
            if (!id) {
              return;
            }
            if (!isOpenRouterUsageReport(usage)) {
              throw new Error("Usage cost not found");
            }
            const vendorId = process.env.WALLET_VENDOR_ID ?? "deco";
            await env.MESH_REQUEST_CONTEXT.state.WALLET.COMMIT_PRE_AUTHORIZED_AMOUNT(
              {
                identifier: id,
                contractId:
                  env.MESH_REQUEST_CONTEXT.connectionId ??
                  env.MESH_REQUEST_CONTEXT.state.WALLET.value,
                vendorId,
                amount: toMicrodollars(
                  usage.providerMetadata.openrouter.usage.cost,
                ),
              },
            );
          },
        };
      },
    });
  },
  configuration: {
    state: StateSchema,
    scopes: [
      "WALLET::PRE_AUTHORIZE_AMOUNT",
      "WALLET::COMMIT_PRE_AUTHORIZED_AMOUNT",
    ],
  },
});

serve(runtime.fetch);
