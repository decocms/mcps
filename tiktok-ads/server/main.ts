/**
 * TikTok Ads MCP Server
 *
 * This MCP provides tools for interacting with TikTok Marketing API,
 * including campaign management, ad groups, ads, and performance reports.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

// TikTok OAuth scopes (for future OAuth implementation)
const TIKTOK_ADS_SCOPES = [
  "ad.operation.read",
  "ad.operation.write",
  "report.read",
].join(",");

// Store the last used redirect_uri for token exchange
let lastRedirectUri: string | null = null;

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),

  // OAuth configuration (prepared for future use when TikTok app is approved)
  // For now, users should use TIKTOK_ACCESS_TOKEN environment variable
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://business-api.tiktok.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      // Parse the callback URL to extract base URL and state parameter
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");

      // Remove state from redirect_uri
      callbackUrlObj.searchParams.delete("state");
      const cleanRedirectUri = callbackUrlObj.toString();

      // Store for later use in exchangeCode
      lastRedirectUri = cleanRedirectUri;

      const url = new URL("https://business-api.tiktok.com/portal/auth");
      url.searchParams.set("redirect_uri", cleanRedirectUri);
      url.searchParams.set("app_id", process.env.TIKTOK_APP_ID!);
      url.searchParams.set("scope", TIKTOK_ADS_SCOPES);

      // Pass state as a separate OAuth parameter
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    // Exchanges the authorization code for access token
    exchangeCode: async ({
      code,
      code_verifier: _code_verifier,
      code_challenge_method: _code_challenge_method,
    }: any) => {
      // Use the stored redirect_uri from authorizationUrl
      const cleanRedirectUri = lastRedirectUri;

      if (!cleanRedirectUri) {
        throw new Error(
          "redirect_uri is required for TikTok OAuth token exchange",
        );
      }

      const body = {
        app_id: process.env.TIKTOK_APP_ID!,
        secret: process.env.TIKTOK_APP_SECRET!,
        auth_code: code,
        grant_type: "authorization_code",
      };

      const response = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TikTok OAuth failed: ${response.status} - ${error}`);
      }

      const result = (await response.json()) as {
        code: number;
        message: string;
        data: {
          access_token: string;
          refresh_token?: string;
          token_type: string;
          advertiser_ids?: string[];
          scope?: string[];
        };
      };

      if (result.code !== 0) {
        throw new Error(`TikTok OAuth failed: ${result.message}`);
      }

      return {
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
        token_type: result.data.token_type || "Bearer",
      };
    },
  },
});

serve(runtime.fetch);
