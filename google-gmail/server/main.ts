/**
 * Gmail MCP Server — Cloudflare Workers entrypoint
 *
 * Exposes Gmail API tools through Google OAuth and receives Pub/Sub
 * push notifications for mailbox changes. State (email→connection
 * mapping, refresh tokens, history watermarks, trigger subscriptions)
 * lives in the EMAIL_MAP KV namespace.
 *
 * Secrets come from wrangler (exposed via process.env under
 * nodejs_compat) and are read lazily per-request because they aren't
 * populated at module init time on Workers.
 */

import { withRuntime } from "@decocms/runtime";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { ENDPOINTS, GOOGLE_SCOPES } from "./constants.ts";
import {
  removeConnectionMappings,
  setEmailMapping,
} from "./lib/email-connection-map.ts";
import {
  claimPendingRefreshToken,
  setLastHistoryId,
  setOAuthKV,
  setRefreshTokenForConnection,
  stashPendingRefreshToken,
} from "./lib/oauth-store.ts";
import { renewAllWatches } from "./lib/scheduled.ts";
import { setTriggerKV } from "./lib/trigger-store.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";
import { handleGmailWebhook } from "./webhook.ts";

type Runtime = ReturnType<
  typeof withRuntime<Env, typeof StateSchema, Registry>
>;

let runtime: Runtime | null = null;

function buildOAuth() {
  const base = createGoogleOAuth({
    scopes: [
      GOOGLE_SCOPES.GMAIL_READONLY,
      GOOGLE_SCOPES.GMAIL_SEND,
      GOOGLE_SCOPES.GMAIL_MODIFY,
      GOOGLE_SCOPES.GMAIL_LABELS,
    ],
  });

  // Wrap exchangeCode so we can stash the refresh_token before it
  // disappears into mesh-managed storage. We don't have a connectionId
  // here yet — onChange will claim the stashed entry once it does.
  const wrappedExchange = async (
    params: { code: string; code_verifier?: string; redirect_uri?: string },
    env?: unknown,
  ) => {
    const result = await base.exchangeCode(params, env);
    if (result.access_token && result.refresh_token) {
      try {
        await stashPendingRefreshToken(
          result.access_token,
          result.refresh_token,
        );
      } catch (err) {
        console.error("[OAuth] failed to stash refresh_token:", err);
      }
    }
    return result;
  };

  return { ...base, exchangeCode: wrappedExchange };
}

function getRuntime(): Runtime {
  if (runtime) return runtime;
  runtime = withRuntime<Env, typeof StateSchema, Registry>({
    oauth: buildOAuth(),
    configuration: {
      state: StateSchema,
      onChange: async (env) => {
        const token = env.MESH_REQUEST_CONTEXT?.authorization;
        const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
        if (!token || !connectionId) return;

        if (!env.EMAIL_MAP) {
          console.warn(
            "[Gmail onChange] EMAIL_MAP binding missing — skipping mapping/watch setup",
          );
          return;
        }

        const accessToken = token.replace(/^Bearer\s+/i, "");

        try {
          const profileRes = await fetch(ENDPOINTS.PROFILE, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!profileRes.ok) {
            console.error(
              `[Gmail onChange] Failed to fetch profile: ${profileRes.status}`,
            );
            return;
          }

          const profile = (await profileRes.json()) as {
            emailAddress: string;
            historyId: string;
          };

          // Drop any stale email→connection mapping owned by *this*
          // connection before writing the new one (handles rebinding to
          // a different mailbox).
          await removeConnectionMappings(env.EMAIL_MAP, connectionId);
          await setEmailMapping(
            env.EMAIL_MAP,
            profile.emailAddress,
            connectionId,
          );
          console.log(
            `[Gmail onChange] Mapped ${profile.emailAddress} → ${connectionId}`,
          );

          // Claim the refresh_token stashed at exchangeCode time and
          // re-key it under the connectionId so webhook/cron contexts
          // can pick it up.
          const refreshToken = await claimPendingRefreshToken(
            env.EMAIL_MAP,
            accessToken,
          );
          if (refreshToken) {
            await setRefreshTokenForConnection(
              env.EMAIL_MAP,
              connectionId,
              refreshToken,
            );
            console.log(
              `[Gmail onChange] Persisted refresh_token for connection=${connectionId}`,
            );
          } else {
            console.warn(
              `[Gmail onChange] No pending refresh_token for connection=${connectionId} — webhook delivery will fail until the user reauthenticates`,
            );
          }

          const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC || "";
          if (!pubsubTopic) {
            console.warn(
              "[Gmail onChange] GMAIL_PUBSUB_TOPIC not set — skipping users.watch (no webhook delivery)",
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

          if (watchRes.ok) {
            const watchData = (await watchRes.json()) as {
              historyId: string;
              expiration: string;
            };
            // Anchor the historyId so the first webhook delivery has a
            // valid startHistoryId to diff against.
            await setLastHistoryId(
              env.EMAIL_MAP,
              connectionId,
              watchData.historyId,
            );
            console.log(
              `[Gmail onChange] Watch registered for ${profile.emailAddress}, expires ${watchData.expiration}`,
            );
          } else {
            const error = await watchRes.text();
            console.error(
              `[Gmail onChange] users.watch failed: ${watchRes.status} - ${error}`,
            );
          }
        } catch (error) {
          console.error("[Gmail onChange] Error:", error);
        }
      },
    },
    tools,
    prompts: [],
  });
  return runtime;
}

async function handle(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Make the KV binding visible to module-level state in trigger-store
  // (runtime calls it without env access) and oauth-store (OAuth
  // callbacks fire without env access).
  setTriggerKV(env.EMAIL_MAP);
  setOAuthKV(env.EMAIL_MAP);

  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname.startsWith("/webhooks/gmail")) {
    return handleGmailWebhook(req, env, ctx);
  }

  return getRuntime().fetch(
    req,
    env,
    ctx as unknown as Parameters<Runtime["fetch"]>[2],
  );
}

async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  setTriggerKV(env.EMAIL_MAP);
  setOAuthKV(env.EMAIL_MAP);
  console.log(
    `[Cron] tick cron=${event.cron} scheduledTime=${event.scheduledTime}`,
  );
  ctx.waitUntil(renewAllWatches(env));
}

export default {
  fetch: handle,
  scheduled,
};
