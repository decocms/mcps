/**
 * GitHub MCP Server — Cloudflare Workers entrypoint
 *
 * OAuth proxy that exposes the full GitHub MCP toolset (30+ tools)
 * through GitHub App OAuth authentication.
 *
 * Secrets come from wrangler (exposed via process.env under nodejs_compat)
 * and are read lazily per-request because they aren't populated at module
 * init time on Workers.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { withRuntime } from "@decocms/runtime";
import { exchangeCodeForToken } from "./lib/github-client.ts";
import {
  captureInstallationMappings,
  getInstallationStore,
} from "./lib/installation-map.ts";
import { handleProxiedRequest } from "./lib/mcp-proxy.ts";
import { setTriggerKV } from "./lib/trigger-store.ts";
import { getTools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import { handleGitHubWebhook } from "./webhook.ts";

type Runtime = ReturnType<
  typeof withRuntime<Env, typeof StateSchema, Registry>
>;

let runtimePromise: Promise<Runtime> | null = null;

async function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const tools = await getTools();

      return withRuntime<Env, typeof StateSchema, Registry>({
        oauth: {
          mode: "PKCE",
          authorizationServer: "https://github.com",

          authorizationUrl: (callbackUrl) => {
            const clientId = process.env.GITHUB_CLIENT_ID || "";
            const callbackUrlObj = new URL(callbackUrl);
            const state = callbackUrlObj.searchParams.get("state");

            // Remove state from redirect_uri — pass it as a separate param
            callbackUrlObj.searchParams.delete("state");
            const redirectUri = callbackUrlObj.toString();

            const url = new URL("https://github.com/login/oauth/authorize");
            url.searchParams.set("client_id", clientId);
            url.searchParams.set("redirect_uri", redirectUri);
            url.searchParams.set("scope", "repo read:org read:user");

            if (state) {
              url.searchParams.set("state", state);
            }

            return url.toString();
          },

          exchangeCode: async ({ code, redirect_uri }) => {
            const clientId = process.env.GITHUB_CLIENT_ID || "";
            const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";

            if (!clientId || !clientSecret) {
              throw new Error(
                "GitHub OAuth credentials not configured. " +
                  "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.",
              );
            }

            const tokenResponse = await exchangeCodeForToken(
              code,
              clientId,
              clientSecret,
              redirect_uri,
            );

            return {
              access_token: tokenResponse.access_token,
              token_type: tokenResponse.token_type,
            };
          },
        },

        configuration: {
          onChange: async (env) => {
            const token = env.MESH_REQUEST_CONTEXT?.authorization;
            const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
            if (token && connectionId) {
              const store = getInstallationStore(env.INSTALLATIONS);
              await captureInstallationMappings(token, connectionId, store);
            }
          },
          state: StateSchema,
        },

        tools,
        prompts: [],
      });
    })().catch((err) => {
      // Reset on failure so the next request can retry (e.g. transient
      // GitHub App auth or upstream discovery failure).
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

/**
 * Intercept webhook and MCP resource requests before they reach runtime.fetch.
 * The Deco runtime doesn't support resources natively, so we proxy them upstream.
 */
async function handle(req: Request, env: Env, ctx: unknown): Promise<Response> {
  // Make the KV binding visible to the trigger store's module-level
  // storage for this request.
  setTriggerKV(env.INSTALLATIONS);

  const url = new URL(req.url);

  // GitHub webhook endpoint (unauthenticated — signature-verified instead)
  if (req.method === "POST" && url.pathname === "/webhooks/github") {
    return handleGitHubWebhook(req, env);
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

  const runtime = await getRuntime();
  return runtime.fetch(req, env, ctx as Parameters<Runtime["fetch"]>[2]);
}

export default {
  fetch: handle,
};
