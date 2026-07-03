/**
 * Lazy, throttled minting of the durable mesh API key from ANY request
 * context. onChange is the happy path, but it doesn't always fire (runtime
 * version differences) — so tools also call this fire-and-forget. First
 * request with a valid JWT wins; result is persisted in sitemig_connections.
 */

import { isSupabaseConfigured } from "../db/client.ts";
import { loadConnection, saveConnection } from "../db/connections.ts";
import type { Env } from "../types/env.ts";
import {
  API_KEY_GRANTS_STATE_KEY,
  desiredGrants,
  grantsChanged,
  mintPersistentApiKey,
} from "./api-key.ts";
import { bindingConnectionId } from "./persist-state.ts";

const THROTTLE_MS = 60_000;
const lastAttempt = new Map<string, number>();

export async function ensureApiKeyFromRequest(env: Env): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const mrc = env.MESH_REQUEST_CONTEXT;
  const connectionId = mrc?.connectionId;
  if (!connectionId || !mrc?.token) return;

  const last = lastAttempt.get(connectionId) ?? 0;
  if (Date.now() - last < THROTTLE_MS) return;
  lastAttempt.set(connectionId, Date.now());

  try {
    const existing = await loadConnection(connectionId).catch(() => null);
    const organizationId = mrc.organizationId || existing?.organization_id;
    const meshUrl = mrc.meshUrl || existing?.mesh_url;
    if (!organizationId || !meshUrl) return;

    const state = existing?.state ?? {};
    const explicitKey =
      typeof state.MESH_API_KEY === "string" && state.MESH_API_KEY;
    if (explicitKey) return;

    const grants = desiredGrants({
      connectionId,
      bindingConnectionIds: [
        bindingConnectionId(state, "GITHUB"),
        bindingConnectionId(state, "OBJECT_STORAGE"),
      ].filter((v): v is string => !!v),
    });
    const previousGrants = state[API_KEY_GRANTS_STATE_KEY];

    if (existing?.mesh_api_key && !grantsChanged(previousGrants, grants)) {
      return; // already have a key covering the current bindings
    }

    const minted = await mintPersistentApiKey({
      meshUrl,
      organizationId,
      connectionId,
      temporaryToken: mrc.token,
      grants,
    });
    if (!minted) return;

    await saveConnection({
      connectionId,
      organizationId,
      meshUrl,
      meshToken: mrc.token,
      meshApiKey: minted,
      state: { ...state, [API_KEY_GRANTS_STATE_KEY]: grants },
    });
    console.log(`[api-key] minted persistent API key for ${connectionId}`);
  } catch (err) {
    console.error(
      "[api-key] lazy mint failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
