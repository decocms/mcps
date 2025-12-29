/**
 * Grain MCP Server
 *
 * This MCP provides tools for interacting with Grain's API,
 * allowing you to access and manage your meeting recordings.
 *
 * Grain automatically records, transcribes, and summarizes your meetings,
 * making it easy to find key moments and insights from your conversations.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { tools } from "./tools/index.ts";

/**
 * Environment type combining Deco bindings
 */
export type Env = DefaultEnv;

const runtime = withRuntime<Env>({
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://grain.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      // For now, we'll use a simple API key collection flow
      // In the future, Grain may implement OAuth
      const url = new URL("https://grain.com/settings/api");
      url.searchParams.set("callback_url", callbackUrl);
      return url.toString();
    },

    // For now, we expect users to manually configure their API key
    // This is a simplified flow - Grain doesn't have OAuth yet
    exchangeCode: async ({ code }) => {
      // The "code" in this case is the API key the user provides
      return {
        access_token: code,
        token_type: "Bearer",
      };
    },
  },
  tools,
});

export default runtime;
