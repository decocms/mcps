/**
 * Google Calendar MCP Server
 *
 * This MCP provides tools for interacting with Google Calendar API,
 * including calendar management, event CRUD operations, and availability checks.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";

/**
 * Environment type for the MCP server
 */
export type Env = DefaultEnv;

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const runtime = withRuntime<Env>({
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://accounts.google.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      return url.toString();
    },

    // Exchanges the authorization code for access token
    exchangeCode: async ({ code, code_verifier, code_challenge_method }) => {
      const params = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "authorization_code",
      });

      // Add PKCE verifier if provided
      if (code_verifier) {
        params.set("code_verifier", code_verifier);
      }
      if (code_challenge_method) {
        params.set("code_challenge_method", code_challenge_method);
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
  },
  tools,
});

serve(runtime.fetch);
