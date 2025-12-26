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

// Armazena o redirect_uri usado na autorização para usar no exchangeCode
// Como o runtime não passa o redirect_uri no oauthParams, precisamos armazená-lo
let storedRedirectUri: string | null = null;

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
      console.log("[OAuth] authorizationUrl called");
      console.log("[OAuth] callbackUrl received:", callbackUrl);
      console.log("[OAuth] callbackUrl type:", typeof callbackUrl);

      // Armazena o redirect_uri para usar no exchangeCode
      // O Meta precisa do EXATO mesmo redirect_uri (incluindo query params se houver)
      storedRedirectUri = callbackUrl;
      console.log(
        "[OAuth] Stored redirect_uri for exchangeCode:",
        storedRedirectUri,
      );

      const url = new URL(
        `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`,
      );
      url.searchParams.set("client_id", META_APP_ID);
      url.searchParams.set("redirect_uri", callbackUrl);
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

      // Meta requires the EXACT same redirect_uri used in authorization
      // O runtime não passa o redirect_uri nos oauthParams, então usamos o armazenado
      let redirectUri =
        oauthParams.redirect_uri ||
        oauthParams.redirectUri ||
        storedRedirectUri;

      console.log(
        "[OAuth] redirectUri from oauthParams.redirect_uri:",
        oauthParams.redirect_uri,
      );
      console.log(
        "[OAuth] redirectUri from oauthParams.redirectUri:",
        oauthParams.redirectUri,
      );
      console.log(
        "[OAuth] redirectUri from storedRedirectUri:",
        storedRedirectUri,
      );

      // Se o redirectUri tem query params (como ?state=...), extrai apenas a URL base
      // O Meta pode exigir que seja exatamente igual ao usado na autorização
      // Mas vamos tentar primeiro com o valor completo armazenado
      if (redirectUri) {
        try {
          const urlObj = new URL(redirectUri);
          console.log(
            "[OAuth] redirectUri URL object - origin + pathname:",
            urlObj.origin + urlObj.pathname,
          );
          console.log(
            "[OAuth] redirectUri URL object - search:",
            urlObj.search,
          );
          // Manter o redirect_uri completo como foi enviado na autorização
          console.log(
            "[OAuth] Using full redirect_uri with query params:",
            redirectUri,
          );
        } catch (e) {
          console.warn("[OAuth] Failed to parse redirectUri as URL:", e);
        }
      }

      console.log("[OAuth] redirectUri final value:", redirectUri);
      console.log("[OAuth] redirectUri type:", typeof redirectUri);
      console.log("[OAuth] redirectUri length:", redirectUri?.length);

      const params = new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: appSecret,
        code: oauthParams.code,
      });

      if (redirectUri) {
        params.set("redirect_uri", redirectUri);
        console.log(
          "[OAuth] redirect_uri added to params:",
          params.get("redirect_uri"),
        );
      } else {
        console.warn(
          "[OAuth] WARNING: redirectUri is missing! This will cause the request to fail.",
        );
        throw new Error(
          "redirect_uri is required but was not provided by the runtime or stored from authorization",
        );
      }

      if (oauthParams.code_verifier) {
        params.set("code_verifier", oauthParams.code_verifier);
      }

      const requestUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`;
      console.log(
        "[OAuth] Request URL (without secret):",
        requestUrl.replace(appSecret, "***"),
      );
      console.log("[OAuth] All params keys:", Array.from(params.keys()));
      console.log(
        "[OAuth] redirect_uri from params:",
        params.get("redirect_uri"),
      );

      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`,
        { method: "GET" },
      );

      console.log("[OAuth] Response status:", response.status);
      console.log("[OAuth] Response ok:", response.ok);

      if (!response.ok) {
        const error = await response.text();
        console.error("[OAuth] Error response:", error);
        console.error(
          "[OAuth] redirect_uri used in request:",
          params.get("redirect_uri"),
        );
        throw new Error(`Meta OAuth failed: ${response.status} - ${error}`);
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
