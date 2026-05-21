/**
 * Microsoft Teams MCP — Cloudflare Workers entrypoint
 *
 * - deco-native OAuth (PKCE): Studio shows a "Connect to Microsoft" button;
 *   the per-request bearer token arrives via MESH_REQUEST_CONTEXT.authorization.
 * - Webhook (Graph change notifications) is routed in `handle()` before the
 *   request reaches runtime.fetch(), mirroring the github / google-gmail MCPs.
 * - State (triggers, webhook config, cached tokens, dedup, event log) lives in
 *   the TEAMS_KV namespace — Workers isolates are ephemeral.
 *
 * Secrets (MICROSOFT_*) come from wrangler and are exposed via process.env
 * under nodejs_compat; they are read lazily per-request.
 */

import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import { exchangeAuthCode, exchangeRefreshToken, SCOPES } from "./lib/oauth.ts";
import { setKvNamespace } from "./lib/kv.ts";
import { app as webhookRouter } from "./router.ts";

export { StateSchema };

type Runtime = ReturnType<
  typeof withRuntime<Env, typeof StateSchema, Registry>
>;

function getOAuthCredentials(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
} {
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const clientId = process.env.MICROSOFT_CLIENT_ID || "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft OAuth credentials not configured. Set " +
        "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.",
    );
  }
  return { tenantId, clientId, clientSecret };
}

let runtime: Runtime | null = null;

function getRuntime(): Runtime {
  if (!runtime) {
    runtime = withRuntime<Env, typeof StateSchema, Registry>({
      oauth: {
        mode: "PKCE",
        authorizationServer: "https://login.microsoftonline.com",

        authorizationUrl: (callbackUrl) => {
          const { tenantId, clientId } = getOAuthCredentials();
          const callbackUrlObj = new URL(callbackUrl);
          const state = callbackUrlObj.searchParams.get("state");
          callbackUrlObj.searchParams.delete("state");
          const redirectUri = callbackUrlObj.toString();

          const url = new URL(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
          );
          url.searchParams.set("client_id", clientId);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("redirect_uri", redirectUri);
          url.searchParams.set("response_mode", "query");
          url.searchParams.set("scope", SCOPES.join(" "));
          url.searchParams.set("prompt", "select_account");
          if (state) url.searchParams.set("state", state);

          return url.toString();
        },

        exchangeCode: async ({ code, code_verifier, redirect_uri }) => {
          const { tenantId, clientId, clientSecret } = getOAuthCredentials();
          const tokens = await exchangeAuthCode(
            tenantId,
            clientId,
            clientSecret,
            code,
            redirect_uri ?? "",
            code_verifier,
          );
          return {
            access_token: tokens.access_token,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in,
            refresh_token: tokens.refresh_token ?? "",
            scope: tokens.scope || SCOPES.join(" "),
          };
        },

        refreshToken: async (refreshToken) => {
          const { tenantId, clientId, clientSecret } = getOAuthCredentials();
          const tokens = await exchangeRefreshToken(
            tenantId,
            clientId,
            clientSecret,
            refreshToken,
          );
          return {
            access_token: tokens.access_token,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in,
            refresh_token: tokens.refresh_token ?? refreshToken,
            scope: tokens.scope || SCOPES.join(" "),
          };
        },
      },

      configuration: {
        state: StateSchema,
      },

      tools: tools as any,
      prompts: [],
    });
  }
  return runtime;
}

/**
 * Worker entry. Threads the KV binding into the singleton store, routes Graph
 * webhook notifications first, then falls through to the MCP runtime.
 */
async function handle(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Make the KV binding visible to the module-level store for this request.
  setKvNamespace(env.TEAMS_KV);

  // Webhook routes (/health, /teams/notifications/:connectionId) — handled by
  // the Hono router. A 404 means "not a webhook route", so fall through.
  const webhookResponse = await webhookRouter.fetch(req, env, ctx);
  if (webhookResponse.status !== 404) {
    return webhookResponse;
  }

  return getRuntime().fetch(
    req,
    env,
    ctx as unknown as Parameters<Runtime["fetch"]>[2],
  );
}

export default {
  fetch: handle,
};
