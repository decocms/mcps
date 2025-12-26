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
import { META_API_VERSION, META_ADS_SCOPES, META_APP_ID } from "./constants.ts";

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

/**
 * Fixed redirect URI base (without query parameters)
 * Meta App settings should be configured with this exact URL
 */
const META_REDIRECT_URI_BASE =
  "https://sites-meta-ads.decocache.com/oauth/callback";

/**
 * Extract the base redirect_uri (without query parameters)
 * Meta requires the redirect_uri to match what's configured in App settings,
 * which typically doesn't include query parameters like ?state=...
 */
function getBaseRedirectUri(callbackUrl: string): string {
  try {
    const url = new URL(callbackUrl);
    // Return only origin + pathname (no query params or hash)
    return `${url.origin}${url.pathname}`;
  } catch {
    // If URL parsing fails, return the fixed base
    return META_REDIRECT_URI_BASE;
  }
}

const runtime = withRuntime<Env>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://www.facebook.com",

    /**
     * Generates the URL to redirect users to for Meta OAuth authorization
     *
     * CRITICAL: Meta requires the redirect_uri to match EXACTLY what's configured
     * in the App settings. The callbackUrl from runtime may include query params (?state=...),
     * but we should use only the base URL (origin + pathname) to match App settings.
     */
    authorizationUrl: (callbackUrl: string) => {
      console.log("[OAuth] authorizationUrl called");
      console.log("[OAuth] callbackUrl received:", callbackUrl);
      console.log("[OAuth] callbackUrl type:", typeof callbackUrl);

      // Extract base URL (without query params) to match Meta App settings
      const redirectUri = getBaseRedirectUri(callbackUrl);
      console.log(
        "[OAuth] Base redirect_uri (without query params):",
        redirectUri,
      );

      const url = new URL(
        `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`,
      );
      url.searchParams.set("client_id", META_APP_ID);
      // Use the base redirect_uri (without query params) to match App settings
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", META_ADS_SCOPES);
      url.searchParams.set("response_type", "code");

      const finalUrl = url.toString();
      console.log("[OAuth] authorizationUrl final URL:", finalUrl);
      console.log(
        "[OAuth] redirect_uri param value:",
        url.searchParams.get("redirect_uri"),
      );

      return finalUrl;
    },

    /**
     * Exchanges the authorization code for an access token
     *
     * CRITICAL: The redirect_uri MUST be EXACTLY the same as used in authorizationUrl
     * We use the base URL (without query params) to match what's configured in Meta App settings.
     */
    exchangeCode: async (oauthParams: {
      code: string;
      code_verifier?: string;
      redirect_uri?: string;
      redirectUri?: string;
    }) => {
      console.log("[OAuth] exchangeCode called");
      console.log(
        "[OAuth] oauthParams received:",
        JSON.stringify(oauthParams, null, 2),
      );
      console.log(
        "[OAuth] oauthParams.redirect_uri:",
        oauthParams.redirect_uri,
      );
      console.log(
        "[OAuth] oauthParams.redirect_uri type:",
        typeof oauthParams.redirect_uri,
      );
      console.log("[OAuth] oauthParams.redirectUri:", oauthParams.redirectUri);
      console.log(
        "[OAuth] oauthParams.redirectUri type:",
        typeof oauthParams.redirectUri,
      );

      const appSecret = getEnv("META_APP_SECRET");
      console.log(
        "[OAuth] META_APP_SECRET:",
        appSecret ? "found" : "NOT FOUND",
      );

      if (!appSecret) {
        throw new Error("META_APP_SECRET environment variable is required");
      }

      // Get redirect_uri from params (provided by runtime)
      const providedRedirectUri =
        oauthParams.redirect_uri || oauthParams.redirectUri;

      console.log(
        "[OAuth] redirectUri from oauthParams.redirect_uri:",
        oauthParams.redirect_uri,
      );
      console.log(
        "[OAuth] redirectUri from oauthParams.redirectUri:",
        oauthParams.redirectUri,
      );
      console.log(
        "[OAuth] providedRedirectUri (from runtime):",
        providedRedirectUri,
      );

      // Extract base URL (without query params) to match what was used in authorizationUrl
      const redirectUri = providedRedirectUri
        ? getBaseRedirectUri(providedRedirectUri)
        : META_REDIRECT_URI_BASE;

      console.log("[OAuth] Base redirect_uri (extracted):", redirectUri);
      console.log(
        "[OAuth] META_REDIRECT_URI_BASE (fallback):",
        META_REDIRECT_URI_BASE,
      );

      const params = new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: appSecret,
        code: oauthParams.code,
        // CRITICAL: Use the base redirect_uri (without query params) to match authorizationUrl
        // This ensures Meta accepts the token exchange (no error 36008)
        redirect_uri: redirectUri,
      });

      console.log(
        "[OAuth] redirect_uri added to params:",
        params.get("redirect_uri"),
      );
      console.log("[OAuth] All params keys:", Array.from(params.keys()));

      if (oauthParams.code_verifier) {
        params.set("code_verifier", oauthParams.code_verifier);
      }

      const tokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`;
      console.log(
        "[OAuth] Request URL (without secret):",
        tokenUrl.replace(appSecret, "***"),
      );

      const response = await fetch(tokenUrl, { method: "GET" });

      console.log("[OAuth] Response status:", response.status);
      console.log("[OAuth] Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[OAuth] Error response:", errorText);
        console.error(
          "[OAuth] redirect_uri used in request:",
          params.get("redirect_uri"),
        );

        let errorMessage = `Meta OAuth failed: ${response.status} - ${errorText}`;

        // Provide helpful error message for redirect_uri mismatch
        if (response.status === 400 && errorText.includes("36008")) {
          errorMessage +=
            "\n\n❌ OAuth Error 36008: redirect_uri mismatch" +
            "\n\nThe redirect_uri used in token exchange must be IDENTICAL to the one used in the authorization dialog." +
            `\n\n📋 Details:` +
            `\n  - redirect_uri used in exchange: ${redirectUri}` +
            `\n  - redirect_uri provided by runtime: ${providedRedirectUri || "not provided"}` +
            `\n  - Base redirect_uri: ${META_REDIRECT_URI_BASE}` +
            `\n\n🔍 Solution:` +
            `\n  1. Ensure the redirect_uri in Meta App settings matches: ${META_REDIRECT_URI_BASE}` +
            `\n  2. The redirect_uri should NOT include query parameters (like ?state=...)` +
            `\n  3. Both authorization and token exchange use the base URL: ${redirectUri}`;
        }

        throw new Error(errorMessage);
      }

      console.log("[OAuth] Token exchange successful!");

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in?: number;
      };

      // Exchange short-lived token for long-lived token (~60 days)
      const longLivedParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
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
