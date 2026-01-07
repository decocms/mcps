/**
 * Meta Ads Analytics MCP Server
 *
 * This MCP provides tools for analyzing Meta/Facebook advertising campaigns,
 * including performance metrics, insights, and detailed breakdowns.
 *
 * Authentication is handled via Access Token provided during installation.
 * Users can generate tokens from the Graph API Explorer.
 * Short-lived tokens are automatically exchanged for long-lived tokens (~60 days).
 */
import { z } from "zod";
import { withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import {
  exchangeForLongLivedToken,
  shouldExchangeToken,
} from "./lib/meta-client.ts";

/**
 * State schema for Meta Ads MCP configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = BaseStateSchema.extend({
  META_APP_ID: z
    .string()
    .describe(
      "Meta App ID from https://developers.facebook.com/apps/ - Required to exchange for long-lived token",
    ),
  META_APP_SECRET: z
    .string()
    .describe(
      "Meta App Secret from App Settings > Basic - Required to exchange for long-lived token (keep this secret!)",
    ),
  META_ACCESS_TOKEN: z
    .string()
    .describe(
      "Meta Access Token from Graph API Explorer (https://developers.facebook.com/tools/explorer/). Will be automatically exchanged for a long-lived token (~60 days). Required permissions: ads_read, ads_management, pages_read_engagement, business_management",
    ),
});

/**
 * Request context with state containing credentials
 */
interface RequestContext {
  state: {
    META_APP_ID?: string;
    META_APP_SECRET?: string;
    META_ACCESS_TOKEN?: string;
  };
}

/**
 * Environment type for Meta Ads MCP
 */
export type Env = DecoEnv & {
  ASSETS: {
    fetch: (request: Request, init?: RequestInit) => Promise<Response>;
  };
  MESH_REQUEST_CONTEXT?: RequestContext;
};

// Cache for long-lived tokens per session
const longLivedTokenCache = new Map<string, string>();

/**
 * Get the access token from the request context state or environment variables.
 * Automatically exchanges short-lived tokens for long-lived tokens when app credentials are provided.
 */
export const getMetaAccessToken = async (env: Env): Promise<string> => {
  const context = env.MESH_REQUEST_CONTEXT;
  const state = context?.state;

  let token = state?.META_ACCESS_TOKEN;
  let appId = state?.META_APP_ID;
  let appSecret = state?.META_APP_SECRET;

  // Fallback to environment variables for development
  if (typeof process !== "undefined" && process.env) {
    if (!token) token = process.env.META_ACCESS_TOKEN;
    if (!appId) appId = process.env.META_APP_ID;
    if (!appSecret) appSecret = process.env.META_APP_SECRET;
  }

  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN is required. Please configure it in the MCP settings or as an environment variable. " +
        "You can generate a token from https://developers.facebook.com/tools/explorer/",
    );
  }

  // If we have app credentials, try to exchange for long-lived token
  if (appId && appSecret) {
    const cacheKey = `${appId}:${token.substring(0, 20)}`;

    // Check cache first
    const cachedToken = longLivedTokenCache.get(cacheKey);
    if (cachedToken) {
      return cachedToken;
    }

    try {
      // Check if token needs exchange
      const needsExchange = await shouldExchangeToken(token);

      if (needsExchange) {
        const { token: longLivedToken, expiresIn } =
          await exchangeForLongLivedToken(token, appId, appSecret);

        // Cache the long-lived token
        longLivedTokenCache.set(cacheKey, longLivedToken);

        console.log(
          `[Meta Ads] Token exchanged successfully. New token expires in ${Math.floor(expiresIn / 86400)} days.`,
        );

        return longLivedToken;
      }
    } catch (error) {
      // If exchange fails, use original token
      console.warn(
        `[Meta Ads] Could not exchange token for long-lived version: ${error}`,
      );
    }
  }

  return token;
};

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    /**
     * No external scopes needed - we use a user-provided token
     */
    scopes: [],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like. When a user
     * is installing your App, they will have to fill in
     * a form with the fields defined in the state schema.
     */
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   */
  fetch: (req: Request, env: Env) => {
    // In development, ASSETS may not be available
    if (env.ASSETS?.fetch) {
      return env.ASSETS.fetch(req);
    }
    return new Response("Not Found", { status: 404 });
  },
});

export default runtime;
