/**
 * Keeps the sitemig_connections snapshot fresh from ANY authenticated
 * request (throttled), and lazily mints the durable mesh API key.
 *
 * onChange is the happy path, but it doesn't fire reliably on every runtime
 * version — and without a fresh snapshot the background worker reads STALE
 * config (e.g. the user switches SANDBOX_PROVIDER to decopilot in the studio
 * but the worker keeps simulating). So every dashboard poll / tool call
 * re-persists: meshUrl, meshToken and the state snapshot (bindings extracted
 * from the runtime proxies, which expose `.value` = connectionId).
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
import { ORG_SLUG_STATE_KEY } from "./mesh.ts";
import { bindingConnectionId } from "./persist-state.ts";

const THROTTLE_MS = 20_000;
const lastAttempt = new Map<string, number>();

/**
 * JSON-safe snapshot of the request state. Binding values arrive as runtime
 * Proxies — unusable via JSON.stringify — but they expose `.value`
 * (connectionId) and `__type`, so we rebuild the persistable {__type, value}.
 */
export function snapshotRequestState(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === "object") {
      try {
        const proxyValue = (value as { value?: unknown }).value;
        if (typeof proxyValue === "string" && proxyValue.length > 0) {
          const proxyType = (value as { __type?: unknown }).__type;
          out[key] = {
            ...(typeof proxyType === "string" ? { __type: proxyType } : {}),
            value: proxyValue,
          };
          continue;
        }
      } catch {
        // not a binding proxy — fall through
      }
    }
    try {
      JSON.stringify(value);
      out[key] = value;
    } catch {
      // skip non-serializable values
    }
  }
  return out;
}

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

    // Fresh snapshot wins; carry over only our own bookkeeping keys.
    const fresh = snapshotRequestState(
      mrc.state as Record<string, unknown> | undefined,
    );
    const previousGrants = existing?.state?.[API_KEY_GRANTS_STATE_KEY];
    const orgSlug =
      mrc.organizationSlug ?? existing?.state?.[ORG_SLUG_STATE_KEY];
    const state: Record<string, unknown> = {
      ...fresh,
      ...(previousGrants !== undefined
        ? { [API_KEY_GRANTS_STATE_KEY]: previousGrants }
        : {}),
      ...(typeof orgSlug === "string" && orgSlug
        ? { [ORG_SLUG_STATE_KEY]: orgSlug }
        : {}),
    };

    let meshApiKey =
      (typeof state.MESH_API_KEY === "string" && state.MESH_API_KEY) ||
      existing?.mesh_api_key ||
      null;

    const grants = desiredGrants({
      connectionId,
      bindingConnectionIds: [
        bindingConnectionId(state, "GITHUB"),
        bindingConnectionId(state, "OBJECT_STORAGE"),
      ].filter((v): v is string => !!v),
    });

    const needsMint =
      !state.MESH_API_KEY &&
      (!meshApiKey || grantsChanged(previousGrants, grants));
    if (needsMint) {
      const minted = await mintPersistentApiKey({
        meshUrl,
        organizationId,
        connectionId,
        temporaryToken: mrc.token,
        grants,
      });
      if (minted) {
        meshApiKey = minted;
        state[API_KEY_GRANTS_STATE_KEY] = grants;
        console.log(`[api-key] minted persistent API key for ${connectionId}`);
      }
    }

    await saveConnection({
      connectionId,
      organizationId,
      meshUrl,
      meshToken: mrc.token,
      meshApiKey: meshApiKey ?? undefined,
      state,
    });
  } catch (err) {
    console.error(
      "[api-key] snapshot refresh failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
