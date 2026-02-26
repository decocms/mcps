import { tools as openrouterTools } from "@decocms/openrouter/tools";
import { ensureApiKey } from "../lib/provisioning.ts";
import type { Env } from "../types/env.ts";
import { usageTools } from "./usage.ts";

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
 */
export async function tools(env: Env) {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
  const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
  const organizationName = env.MESH_REQUEST_CONTEXT?.state?.ORGANIZATION_NAME;

  const gatewayTools = usageTools.map((factory) => factory(env));

  if (!connectionId || !organizationId) {
    console.warn(
      "[Gateway] ⚠️  tools() called without connectionId or organizationId — falling back to default env",
    );
    return [...openrouterTools(env), ...gatewayTools];
  }

  const orgKey = await ensureApiKey(
    connectionId,
    organizationId,
    meshUrl ?? "",
    organizationName,
  );

  if (!orgKey) {
    console.error(
      `[Gateway] ❌ No API key for org "${organizationId}" — LLM call will likely fail`,
    );
    return [...openrouterTools(env), ...gatewayTools];
  }

  return [
    ...openrouterTools({
      ...env,
      MESH_REQUEST_CONTEXT: {
        ...env.MESH_REQUEST_CONTEXT,
        authorization: orgKey,
      },
    }),
    ...gatewayTools,
  ];
}
