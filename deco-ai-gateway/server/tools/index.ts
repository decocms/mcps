import { tools as openrouterTools } from "@decocms/openrouter/tools";
import { ensureApiKey } from "../lib/provisioning.ts";
import { loadConnectionConfig } from "../lib/supabase-client.ts";
import { getKeyDetails, updateKeyLimit } from "../lib/openrouter-keys.ts";
import {
  DEFAULT_LIMIT_USD,
  DEFAULT_POSTPAID_LIMIT_USD,
} from "../lib/constants.ts";
import { logger } from "../lib/logger.ts";
import type { Env } from "../types/env.ts";
import { usageTools } from "./usage.ts";
import { setLimitTools } from "./set-limit.ts";
import { confirmPaymentTools } from "./confirm-payment.ts";
import { creditsTools } from "./credits.ts";
import { alertTools } from "./alert.ts";
import { checkAndSendBalanceAlert } from "../lib/balance-alert.ts";

type OpenRouterEnv = Parameters<typeof openrouterTools>[0];

const verifiedConnections = new Set<string>();

async function ensureKeyLimitMatchesBillingMode(
  connectionId: string,
): Promise<void> {
  try {
    const row = await loadConnectionConfig(connectionId);
    if (!row?.openrouter_key_hash) return;

    if (!verifiedConnections.has(connectionId)) {
      const billingMode = row.billing_mode ?? "prepaid";
      const limitPeriod = row.limit_period ?? null;
      const details = await getKeyDetails(row.openrouter_key_hash);

      const expectedDefault =
        billingMode === "prepaid"
          ? DEFAULT_LIMIT_USD
          : DEFAULT_POSTPAID_LIMIT_USD;

      if (details.limit == null) {
        logger.info("Key missing limit, applying default", {
          connectionId,
          billingMode,
          defaultLimit: expectedDefault,
          limitPeriod,
        });
        await updateKeyLimit(
          row.openrouter_key_hash,
          expectedDefault,
          limitPeriod,
          false,
        );
      }

      verifiedConnections.add(connectionId);
    }

    if (row.alert_enabled) {
      const details = await getKeyDetails(row.openrouter_key_hash);
      checkAndSendBalanceAlert(
        row,
        details.limit,
        details.limit_remaining,
        undefined,
      ).catch(() => {});
    }
  } catch (err) {
    logger.error("Failed to verify/apply key limit", {
      connectionId,
      error: String(err),
    });
  }
}

/**
 * Returns the OpenRouter tools with the org-scoped API key injected.
 *
 * On every tool call:
 * 1. Checks in-memory cache (instant)
 * 2. Falls back to Supabase (decrypt on load)
 * 3. Creates a new OpenRouter key if none exists (first call per org)
 *
 * getOpenRouterApiKey() in the openrouter package reads from
 * env.MESH_REQUEST_CONTEXT.authorization, so we override that field
 * with the org-scoped key.
 *
 * IMPORTANT: We use a Proxy instead of object spread to preserve prototype
 * methods on MESH_REQUEST_CONTEXT (e.g. ensureAuthenticated). Spreading a
 * class instance into a plain object silently loses prototype methods, which
 * causes ensureAuthenticated() to throw TypeError inside the LLM stream tool
 * — manifesting as a timeout on the client side.
 */
export async function tools(env: Env) {
  const meshCtx = env.MESH_REQUEST_CONTEXT;
  const connectionId = meshCtx?.connectionId;
  const organizationId = meshCtx?.organizationId;
  const meshUrl = meshCtx?.meshUrl;
  const organizationName = meshCtx?.state?.ORGANIZATION_NAME;

  logger.debug("tools() called", {
    connectionId,
    organizationId,
    meshUrl,
    hasMeshContext: !!meshCtx,
    hasEnsureAuthenticated:
      typeof (meshCtx as unknown as Record<string, unknown>)
        ?.ensureAuthenticated === "function",
  });

  const gatewayTools = [
    ...usageTools.map((factory) => factory(env)),
    ...setLimitTools.map((factory) => factory(env)),
    ...confirmPaymentTools.map((factory) => factory(env)),
    ...creditsTools.map((factory) => factory(env)),
    ...alertTools.map((factory) => factory(env)),
  ];

  if (!connectionId || !organizationId) {
    logger.warn("tools() called without connectionId or organizationId", {
      connectionId,
      organizationId,
    });
    return [
      ...openrouterTools(env as unknown as OpenRouterEnv),
      ...gatewayTools,
    ];
  }

  const orgKey = await ensureApiKey(
    connectionId,
    organizationId,
    meshUrl ?? "",
    organizationName,
  );

  await ensureKeyLimitMatchesBillingMode(connectionId);

  if (!orgKey) {
    logger.error("No API key available for org — LLM call will fail", {
      connectionId,
      organizationId,
    });
    return [
      ...openrouterTools(env as unknown as OpenRouterEnv),
      ...gatewayTools,
    ];
  }

  logger.debug("Injecting org key into MESH_REQUEST_CONTEXT via Proxy", {
    connectionId,
    organizationId,
  });

  // Use a Proxy to intercept `authorization` while preserving ALL other
  // properties and prototype methods on the original MESH_REQUEST_CONTEXT
  // object. This is critical: spreading a class instance into a plain object
  // strips prototype methods (like ensureAuthenticated), which causes LLM
  // stream/generate tools to throw TypeError inside their execute handlers.
  const meshContextWithKey = new Proxy(meshCtx as object, {
    get(target, prop) {
      if (prop === "authorization") return orgKey;
      const value = (target as Record<string | symbol, unknown>)[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  const envWithKey = {
    ...env,
    MESH_REQUEST_CONTEXT: meshContextWithKey,
  } as unknown as OpenRouterEnv;

  return [...openrouterTools(envWithKey), ...gatewayTools];
}
