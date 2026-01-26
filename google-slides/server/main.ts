/**
 * Google Slides MCP Server
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const SLIDES_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://accounts.google.com",
    authorizationUrl: (callbackUrl) => {
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");
      callbackUrlObj.searchParams.delete("state");
      const cleanRedirectUri = callbackUrlObj.toString();

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("redirect_uri", cleanRedirectUri);
      url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SLIDES_SCOPES);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      if (state) url.searchParams.set("state", state);
      return url.toString();
    },
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
      if (code_verifier) params.set("code_verifier", code_verifier);

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
