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
import { setOAuthKV, stashPendingRefreshToken } from "./lib/oauth-store.ts";
import { renewAllWatches } from "./lib/scheduled.ts";
import { ensureGmailSetup } from "./lib/setup.ts";
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
  // yet, so we key by the user's Gmail address — looked up via the
  // profile API with the just-issued access_token. Setup will claim
  // the entry once it knows both the email and the connectionId.
  const wrappedExchange = async (
    params: { code: string; code_verifier?: string; redirect_uri?: string },
    env?: unknown,
  ) => {
    const result = await base.exchangeCode(params, env);
    if (result.access_token && result.refresh_token) {
      try {
        const profileRes = await fetch(ENDPOINTS.PROFILE, {
          headers: { Authorization: `Bearer ${result.access_token}` },
        });
        if (!profileRes.ok) {
          console.error(
            `[OAuth] profile fetch failed at exchangeCode: ${profileRes.status}`,
          );
        } else {
          const profile = (await profileRes.json()) as { emailAddress: string };
          await stashPendingRefreshToken(
            profile.emailAddress,
            result.refresh_token,
          );
        }
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
      // Mesh only invokes ON_MCP_CONFIGURATION (which fires this) when
      // the user actually saves config state. With an empty StateSchema
      // the user can authenticate and configure a trigger without ever
      // touching that path, so onChange isn't a reliable setup hook on
      // its own — every tool also runs the same idempotent setup via
      // getAccessTokenWithSetup. Keeping onChange wired means setup
      // *also* runs when the user does change config, which is cheaper
      // than waiting for the first tool call.
      onChange: async (env) => {
        const token = env.MESH_REQUEST_CONTEXT?.authorization;
        const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
        if (!token || !connectionId) return;
        const accessToken = token.replace(/^Bearer\s+/i, "");
        await ensureGmailSetup(env, accessToken, connectionId);
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
