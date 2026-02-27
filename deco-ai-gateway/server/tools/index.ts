import { tools as openrouterTools } from "@decocms/openrouter/tools";
import { ensureApiKey } from "../lib/provisioning.ts";
import { logger } from "../lib/logger.ts";
import type { Env } from "../types/env.ts";
import { usageTools } from "./usage.ts";
import { setLimitTools } from "./set-limit.ts";
import { confirmPaymentTools } from "./confirm-payment.ts";

type OpenRouterEnv = Parameters<typeof openrouterTools>[0];

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
