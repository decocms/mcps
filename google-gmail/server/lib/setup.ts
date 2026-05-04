/**
 * Idempotent per-connection setup. Runs the work that *should* happen
 * inside `configuration.onChange` — fetch profile, write the email ↔
 * connection mapping, claim the pending refresh_token, register the
 * Pub/Sub watch, and anchor the historyId watermark.
 *
 * Why this lives outside onChange too: mesh only invokes
 * ON_MCP_CONFIGURATION (which fires our onChange) when the user saves
 * configuration state. With an empty StateSchema, that handler may
 * never fire — the user authenticates, configures a trigger, and never
 * touches a "save settings" button. Without onChange running, no
 * users.watch is registered with Google and Pub/Sub never fires.
 *
 * So we also run this on every authenticated tool call, mirroring the
 * github MCP's `ensureInstallationMappings` pattern. The cheap path is
 * a single KV read once setup is complete.
 */

import { ENDPOINTS } from "../constants.ts";
import {
  getEmailForConnection,
  removeConnectionMappings,
  setEmailMapping,
} from "./email-connection-map.ts";
import {
  claimPendingRefreshToken,
  getRefreshTokenForConnection,
  setLastHistoryId,
  setRefreshTokenForConnection,
} from "./oauth-store.ts";
import type { Env } from "../types/env.ts";

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export async function ensureGmailSetup(
  env: Env,
  accessToken: string,
  connectionId: string,
): Promise<void> {
  const kv = env.EMAIL_MAP;
  if (!kv) return;

  // Fast path: setup already ran for this connection. We treat
  // "we have an email mapping AND a refresh_token" as the cheap
  // signal that everything else (watch, history anchor) is also
  // fine. If a downstream piece is broken we'd see it in webhook
  // logs and run setup again on demand.
  const [existingEmail, existingRefresh] = await Promise.all([
    getEmailForConnection(kv, connectionId),
    getRefreshTokenForConnection(kv, connectionId),
  ]);
  if (existingEmail && existingRefresh) {
    return;
  }

  try {
    const profileRes = await fetch(ENDPOINTS.PROFILE, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      console.error(
        `[Gmail setup] profile fetch failed: ${profileRes.status} (connection=${connectionId})`,
      );
      return;
    }
    const profile = (await profileRes.json()) as {
      emailAddress: string;
      historyId: string;
    };

    if (!existingEmail || existingEmail !== profile.emailAddress) {
      await removeConnectionMappings(kv, connectionId);
      await setEmailMapping(kv, profile.emailAddress, connectionId);
      console.log(
        `[Gmail setup] Mapped ${profile.emailAddress} → ${connectionId}`,
      );
    }

    if (!existingRefresh) {
      const refreshToken = await claimPendingRefreshToken(
        kv,
        profile.emailAddress,
      );
      if (refreshToken) {
        await setRefreshTokenForConnection(kv, connectionId, refreshToken);
        console.log(
          `[Gmail setup] Persisted refresh_token for connection=${connectionId}`,
        );
      } else {
        console.warn(
          `[Gmail setup] No pending refresh_token for ${profile.emailAddress} (connection=${connectionId}) — webhook delivery will fail until the user reauthenticates`,
        );
      }
    }

    const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC || "";
    if (!pubsubTopic) {
      console.warn(
        "[Gmail setup] GMAIL_PUBSUB_TOPIC not set — skipping users.watch (no webhook delivery)",
      );
      return;
    }

    const watchRes = await fetch(ENDPOINTS.WATCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: pubsubTopic,
        labelIds: ["INBOX"],
      }),
    });
    if (!watchRes.ok) {
      const error = await watchRes.text();
      console.error(
        `[Gmail setup] users.watch failed: ${watchRes.status} - ${error} (connection=${connectionId})`,
      );
      return;
    }

    const watchData = (await watchRes.json()) as {
      historyId: string;
      expiration: string;
    };
    await setLastHistoryId(kv, connectionId, watchData.historyId);
    console.log(
      `[Gmail setup] Watch registered for ${profile.emailAddress}, expires ${watchData.expiration}`,
    );
  } catch (err) {
    console.error(`[Gmail setup] error for connection=${connectionId}:`, err);
  }
}

/**
 * Convenience wrapper used by every tool: pulls accessToken +
 * connectionId from MESH_REQUEST_CONTEXT, runs the idempotent setup,
 * returns the accessToken so the tool can keep going. Throws the same
 * "Not authenticated" error as the old getGoogleAccessToken if the
 * Bearer is missing.
 */
export async function getAccessTokenWithSetup(env: Env): Promise<string> {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error("Not authenticated. Please authorize with Gmail first.");
  }
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (connectionId && env.EMAIL_MAP) {
    await ensureGmailSetup(env, accessToken, connectionId);
  }
  return accessToken;
}

// Re-export the KV interface so callers don't need to import directly.
export type { KVNamespaceLike };
