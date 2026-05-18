/**
 * Microsoft Teams MCP — Main Entry Point
 *
 * Uses the deco runtime's native OAuth integration:
 *  - Studio shows a "Connect to Microsoft" button automatically
 *  - Token storage / refresh is handled by the mesh
 *  - Tools read the per-request bearer token from MESH_REQUEST_CONTEXT.authorization
 *
 * Webhook routes (Graph change notifications) still live in router.ts and
 * are layered in front of runtime.fetch() via the serve() handler.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import { exchangeAuthCode, exchangeRefreshToken, SCOPES } from "./lib/oauth.ts";
import { initializeKvStore } from "./lib/kv.ts";
import { logger } from "./lib/logger.ts";
import { app as webhookRouter } from "./router.ts";

export { StateSchema };

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
        "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in your environment.",
    );
  }
  return { tenantId, clientId, clientSecret };
}

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  oauth: {
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

    exchangeCode: async ({ code, redirect_uri }) => {
      const { tenantId, clientId, clientSecret } = getOAuthCredentials();
      const tokens = await exchangeAuthCode(
        tenantId,
        clientId,
        clientSecret,
        code,
        redirect_uri,
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

// KV store still needed for trigger subscriptions and webhook config
await initializeKvStore("./data/teams-kv.json");

serve(async (req, env, ctx) => {
  const webhookResponse = await webhookRouter.fetch(req, env, ctx);
  if (webhookResponse.status === 404) {
    return runtime.fetch(req, env, ctx);
  }
  return webhookResponse;
});

const PORT = process.env.PORT ?? 8080;
logger.info("Microsoft Teams MCP started", {
  port: Number(PORT),
  route: "/mcp",
  webhook: "/teams/notifications/:connectionId",
  oauth: "deco-native (Studio Connect button)",
});
