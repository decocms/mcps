/**
 * GitHub MCP Server
 *
 * OAuth proxy that exposes the full GitHub MCP toolset (30+ tools)
 * through GitHub App OAuth authentication.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { exchangeCodeForToken } from "./lib/github-client.ts";
import { captureInstallationMappings } from "./lib/installation-map.ts";
import {
  handleProxiedRequest,
  invalidateUpstreamCache,
} from "./lib/mcp-proxy.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import { handleGitHubWebhook } from "./webhook.ts";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://github.com",

    authorizationUrl: (callbackUrl) => {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", GITHUB_CLIENT_ID);

      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    exchangeCode: async ({ code }) => {
      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        throw new Error(
          "GitHub OAuth credentials not configured. " +
            "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.",
        );
      }

      const tokenResponse = await exchangeCodeForToken(
        code,
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
      );

      console.log("[GitHub OAuth] Token exchange successful");

      return {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
      };
    },
  },

  configuration: {
    onChange: async (env) => {
      invalidateUpstreamCache();

      const token = env.MESH_REQUEST_CONTEXT?.authorization;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (token && connectionId) {
        await captureInstallationMappings(token, connectionId);
      }
    },
    state: StateSchema,
  },

  tools,
  prompts: [],
});

const port = process.env.PORT || 8001;

/**
 * Wrap runtime.fetch to intercept MCP resource requests before the SDK handles them.
 * The Deco runtime doesn't support resources natively, so we proxy them upstream.
 */
const wrappedFetch: typeof runtime.fetch = async (req, env, ctx) => {
  const url = new URL(req.url);

  // GitHub webhook endpoint (unauthenticated — signature-verified instead)
  if (req.method === "POST" && url.pathname === "/webhooks/github") {
    return handleGitHubWebhook(req);
  }

  // Proxy MCP resource requests to upstream
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (token && req.method === "POST" && url.pathname === "/mcp") {
    const upstreamUrl = "https://api.githubcopilot.com/mcp/";
    const proxied = await handleProxiedRequest(req.clone(), upstreamUrl, token);
    if (proxied) return proxied;
  }

  return runtime.fetch(req, env, ctx);
};

serve(wrappedFetch);

console.log(`
╔══════════════════════════════════════════════════════════╗
║               GitHub MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  OAuth proxy for the official GitHub MCP Server          ║
╚══════════════════════════════════════════════════════════╝

🚀 Server listening on http://localhost:${port}/mcp

📋 Environment Variables:
   GITHUB_CLIENT_ID      - GitHub App Client ID
   GITHUB_CLIENT_SECRET  - GitHub App Client Secret
`);
