/**
 * Meta Ads Analytics MCP Server
 *
 * This MCP provides tools for analyzing Meta/Facebook advertising campaigns,
 * including performance metrics, insights, and detailed breakdowns.
 *
 * Authentication is handled via OAuth PKCE with Meta's Graph API.
 *
 * Required environment variables (set as secrets in Deco/GitHub):
 * - META_APP_ID: Facebook App ID
 * - META_APP_SECRET: Facebook App Secret
 */
import { readFileSync } from "fs";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { tools } from "./tools/index.ts";
import { META_API_VERSION, META_ADS_SCOPES } from "./constants.ts";

/**
 * Load environment variables from .dev.vars for local development
 * In production, these are injected by Deco runtime via secrets
 */
const loadEnvVars = (): Record<string, string> => {
  const vars: Record<string, string> = {};
  try {
    const text = readFileSync(".dev.vars", "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          vars[trimmed.substring(0, idx).trim()] = trimmed
            .substring(idx + 1)
            .trim();
        }
      }
    }
  } catch {
    // File doesn't exist - will use process.env (production)
  }
  return vars;
};

const envVars = loadEnvVars();

// Helper to get env var from .dev.vars or process.env
const getEnv = (key: string): string | undefined =>
  envVars[key] || process.env[key];

/**
 * Environment type for Meta Ads MCP
 */
export type Env = DefaultEnv & {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
};

/**
 * Get the access token from the request context
 */
export const getMetaAccessToken = (env: Env): string => {
  // @ts-ignore - MESH_REQUEST_CONTEXT is injected by the runtime
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Meta authorization is required. Please authenticate with Meta first.",
    );
  }
  return authorization;
};

const runtime = withRuntime<Env>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://www.facebook.com",

    /**
     * Generates the URL to redirect users to for Meta OAuth authorization
     */
    authorizationUrl: (callbackUrl: string) => {
      const appId = getEnv("META_APP_ID");
      if (!appId) {
        throw new Error("META_APP_ID environment variable is required");
      }

      const url = new URL(
        `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`,
      );
      url.searchParams.set("client_id", appId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("scope", META_ADS_SCOPES);
      url.searchParams.set("response_type", "code");

      return url.toString();
    },

    /**
     * Exchanges the authorization code for an access token
     */
    exchangeCode: async (oauthParams: {
      code: string;
      code_verifier?: string;
      redirect_uri?: string;
      redirectUri?: string;
    }) => {
      const appId = getEnv("META_APP_ID");
      const appSecret = getEnv("META_APP_SECRET");

      if (!appId || !appSecret) {
        throw new Error(
          "META_APP_ID and META_APP_SECRET environment variables are required",
        );
      }

      // Meta requires the EXACT same redirect_uri used in authorization
      // The runtime provides this via oauthParams
      const redirectUri = oauthParams.redirect_uri || oauthParams.redirectUri;

      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        code: oauthParams.code,
      });

      if (redirectUri) {
        params.set("redirect_uri", redirectUri);
      }

      if (oauthParams.code_verifier) {
        params.set("code_verifier", oauthParams.code_verifier);
      }

      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Meta OAuth failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in?: number;
      };

      // Exchange short-lived token for long-lived token (~60 days)
      const longLivedParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: data.access_token,
      });

      const longLivedResponse = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${longLivedParams.toString()}`,
      );

      if (longLivedResponse.ok) {
        const longLivedData = (await longLivedResponse.json()) as {
          access_token: string;
          token_type: string;
          expires_in?: number;
        };
        return {
          access_token: longLivedData.access_token,
          token_type: longLivedData.token_type || "Bearer",
          expires_in: longLivedData.expires_in,
        };
      }

      // Log warning when long-lived token exchange fails
      // User will receive short-lived token (~1 hour) instead of long-lived (~60 days)
      const longLivedError = await longLivedResponse.text();
      console.warn(
        `Failed to exchange for long-lived token (${longLivedResponse.status}): ${longLivedError}. ` +
          "Falling back to short-lived token (~1 hour instead of ~60 days).",
      );

      // Fallback to short-lived token if long-lived exchange fails
      return {
        access_token: data.access_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
      };
    },
  },
  tools,
});

export default runtime;
