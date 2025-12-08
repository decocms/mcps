/**
 * OpenRouter MCP Server
 *
 * This MCP provides tools for interacting with OpenRouter's API,
 * including model discovery, comparison, and AI chat completions.
 *
 * OpenRouter offers a unified API for accessing hundreds of AI models
 * with built-in fallback mechanisms, cost optimization, and provider routing.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { tools } from "./tools/index.ts";

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv;

const runtime = withRuntime<Env>({
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://openrouter.ai",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      const url = new URL("https://openrouter.ai/auth");
      url.searchParams.set("callback_url", callbackUrl);
      // Optional: Add PKCE code challenge for extra security
      // url.searchParams.set("code_challenge", codeChallenge);
      // url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },

    // Exchanges the authorization code for an API key
    exchangeCode: async ({ code, code_verifier, code_challenge_method }) => {
      const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier,
          code_challenge_method,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter auth failed: ${response.status}`);
      }

      const { key } = (await response.json()) as { key: string };

      // Map OpenRouter's response to OAuth token format
      return {
        access_token: key,
        token_type: "Bearer",
      };
    },
  },
  tools,
});

export default runtime;
