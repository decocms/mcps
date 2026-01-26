/**
 * Google Tag Manager MCP Server
 *
 * This MCP provides tools for interacting with Google Tag Manager API v2,
 * including account, container, workspace, tag, trigger, and variable management.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const GTM_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.manage.accounts",
].join(" ");

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://accounts.google.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      // Parse the callback URL to extract base URL and state parameter
      // Google OAuth doesn't allow 'state' inside redirect_uri
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");

      // Remove state from redirect_uri (Google requires clean redirect_uri)
      callbackUrlObj.searchParams.delete("state");
      const cleanRedirectUri = callbackUrlObj.toString();

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("redirect_uri", cleanRedirectUri);
      url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GTM_SCOPES);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");

      // Pass state as a separate OAuth parameter (Google will return it in the callback)
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    // Exchanges the authorization code for access token
    exchangeCode: async ({ code, code_verifier, redirect_uri }) => {
      if (!redirect_uri) {
        throw new Error(
          "redirect_uri is required for Google OAuth token exchange",
        );
      }

      const params = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri,
      });

      // Add PKCE verifier if provided
      if (code_verifier) {
        params.set("code_verifier", code_verifier);
      }

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google OAuth failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type: string;
      };

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
      };
    },

    // Refreshes the access token using the refresh token
    refreshToken: async (refreshToken) => {
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      });

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Google OAuth refresh failed: ${response.status} - ${error}`,
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type: string;
      };

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
      };
    },
  },
});

serve(runtime.fetch);
