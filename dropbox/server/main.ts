/**
 * Dropbox MCP Server — Cloudflare Workers entrypoint
 *
 * Exposes Dropbox API v2 tools through OAuth 2.0 + PKCE with offline refresh
 * tokens. Stateless: no KV, no webhooks. Bearer token arrives per-request
 * via MESH_REQUEST_CONTEXT.authorization.
 *
 * Secrets come from wrangler (exposed via process.env under nodejs_compat)
 * and are read lazily per-request because they aren't populated at module
 * init time on Workers.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { withRuntime } from "@decocms/runtime";
import {
  exchangeCodeForToken,
  refreshAccessToken,
  REQUESTED_SCOPES,
} from "./lib/dropbox-oauth.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.DROPBOX_CLIENT_ID || "";
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Dropbox OAuth credentials not configured. " +
        "Set DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET environment variables.",
    );
  }
  return { clientId, clientSecret };
}

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://www.dropbox.com",

    authorizationUrl: (callbackUrl) => {
      const clientId = process.env.DROPBOX_CLIENT_ID || "";
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");

      // Match the airtable/google pattern: keep the redirect_uri free of state
      // and pass state as a separate OAuth param.
      callbackUrlObj.searchParams.delete("state");
      const redirectUri = callbackUrlObj.toString();

      const url = new URL("https://www.dropbox.com/oauth2/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("token_access_type", "offline");
      url.searchParams.set("scope", REQUESTED_SCOPES.join(" "));

      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    exchangeCode: async ({ code, code_verifier, redirect_uri }) => {
      const { clientId, clientSecret } = getOAuthCredentials();

      const tokenResponse = await exchangeCodeForToken({
        code,
        clientId,
        clientSecret,
        redirectUri: redirect_uri,
        codeVerifier: code_verifier,
      });

      return {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
        expires_in: tokenResponse.expires_in,
        refresh_token: tokenResponse.refresh_token,
        scope: tokenResponse.scope || REQUESTED_SCOPES.join(" "),
      };
    },

    refreshToken: async (refreshToken) => {
      const { clientId, clientSecret } = getOAuthCredentials();

      const tokenResponse = await refreshAccessToken({
        refreshToken,
        clientId,
        clientSecret,
      });

      return {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
        expires_in: tokenResponse.expires_in,
        // Dropbox does not rotate refresh tokens — echo back the original so
        // the runtime always has one to return to the client.
        refresh_token: tokenResponse.refresh_token ?? refreshToken,
        scope: tokenResponse.scope || REQUESTED_SCOPES.join(" "),
      };
    },
  },

  configuration: {
    state: StateSchema,
  },

  tools,
  prompts: [],
});

export default {
  fetch: runtime.fetch,
};
