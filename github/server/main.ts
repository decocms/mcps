/**
 * GitHub MCP Server
 *
 * This MCP provides a webhook event hub for GitHub repositories.
 * It receives GitHub webhooks via a Streamable Tool endpoint and
 * publishes them to the MCP Mesh Event Bus.
 *
 * Features:
 * - GitHub App OAuth flow for multi-tenant installations
 * - Automatic webhook registration via onChange
 * - Support for org-wide webhooks, single repo, or all repos
 * - User-configurable event subscriptions (via StateSchema)
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import {
  exchangeCodeForToken,
  GitHubClient,
  type Repository,
} from "./lib/github-client.ts";
import { tools } from "./tools/index.ts";
import { type Env, type GitHubWebhookEvent, StateSchema } from "./types/env.ts";

// GitHub OAuth configuration from environment
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_APP_NAME = process.env.GITHUB_APP_NAME || "decocms-bot";

/**
 * Parse the TARGET configuration value
 *
 * Returns:
 * - { type: "all" } for empty string (all accessible repos)
 * - { type: "org", org: "name" } for "org:name" format
 * - { type: "repo", owner: "owner", repo: "repo" } for "owner/repo" format
 */
function parseTarget(
  target: string | undefined,
):
  | { type: "all" }
  | { type: "org"; org: string }
  | { type: "repo"; owner: string; repo: string } {
  if (!target || target.trim() === "") {
    return { type: "all" };
  }

  const trimmed = target.trim();

  // Check for org:name format
  if (trimmed.startsWith("org:")) {
    const org = trimmed.slice(4).trim();
    if (org) {
      return { type: "org", org };
    }
    return { type: "all" };
  }

  // Check for owner/repo format
  if (trimmed.includes("/")) {
    const [owner, repo] = trimmed.split("/", 2);
    if (owner && repo) {
      return { type: "repo", owner, repo };
    }
  }

  // If it doesn't match any format, treat as org name
  return { type: "org", org: trimmed };
}

/**
 * MCP Runtime configuration
 */
const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://github.com",

    /**
     * Generate the authorization URL for GitHub App installation
     *
     * Uses /installations/select_target which:
     * - Lets user select organization/account
     * - Works for new installations
     * - For already installed apps, user can click "Configure" then "Save" to re-authorize
     *
     * Note: Make sure "Request user authorization (OAuth) during installation" is
     * enabled in the GitHub App settings for re-authorization to work.
     */
    authorizationUrl: (callbackUrl) => {
      // Use select_target to let user choose org/account
      const url = new URL(
        `https://github.com/apps/${GITHUB_APP_NAME}/installations/select_target`,
      );

      // Parse the callback URL to extract state parameter
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");

      // Pass state for CSRF protection and to preserve the redirect flow
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    /**
     * Exchange the installation code for an access token
     */
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
    /**
     * Called when the MCP configuration changes
     *
     * Registers webhooks with GitHub based on TARGET configuration:
     * - Empty: All accessible repositories (one webhook per repo)
     * - "org:name": Single organization-wide webhook (more efficient)
     * - "owner/repo": Single repository webhook
     */
    onChange: async (env) => {
      console.log("[GitHub] Configuration changed, setting up webhooks...");

      // Get configuration from context - state is managed by Mesh
      const token = env.MESH_REQUEST_CONTEXT?.authorization;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const target = env.MESH_REQUEST_CONTEXT?.state?.TARGET;
      const selectedEvents = (env.MESH_REQUEST_CONTEXT?.state
        ?.WEBHOOK_EVENTS || [
        "push",
        "pull_request",
        "issues",
      ]) as GitHubWebhookEvent[];

      const parsedTarget = parseTarget(target);

      console.log("[GitHub] Context:", {
        hasToken: !!token,
        meshUrl,
        connectionId,
        target: parsedTarget,
        selectedEvents,
      });

      if (!token || !meshUrl || !connectionId) {
        console.log(
          "[GitHub] Missing required configuration, waiting for OAuth...",
        );
        return;
      }

      // Create GitHub client with OAuth token
      const githubClient = GitHubClient.for(token);

      // Webhook URL points to our Streamable Tool endpoint
      const webhookUrl = `${meshUrl}/mcp/${connectionId}/call-tool/MESH_PUBLIC_GITHUB_WEBHOOK`;
      console.log(`[GitHub] Webhook URL: ${webhookUrl}`);

      // Handle different target modes
      switch (parsedTarget.type) {
        case "org": {
          // Register single organization-wide webhook
          console.log(
            `[GitHub] Setting up organization webhook for: ${parsedTarget.org}`,
          );
          try {
            const webhook = await githubClient.upsertOrgWebhook({
              org: parsedTarget.org,
              url: webhookUrl,
              events: selectedEvents,
              contentType: "json",
              secret: process.env.GITHUB_WEBHOOK_SECRET,
            });
            console.log(
              `[GitHub] ✓ Org webhook registered for ${parsedTarget.org} (ID: ${webhook.id})`,
            );
          } catch (error) {
            console.error(
              `[GitHub] ✗ Failed to setup org webhook for ${parsedTarget.org}:`,
              error,
            );
          }
          break;
        }

        case "repo": {
          // Register webhook for a single repository
          const { owner, repo } = parsedTarget;
          console.log(
            `[GitHub] Setting up webhook for repository: ${owner}/${repo}`,
          );
          try {
            const webhook = await githubClient.upsertWebhook({
              owner,
              repo,
              url: webhookUrl,
              events: selectedEvents,
              contentType: "json",
              secret: process.env.GITHUB_WEBHOOK_SECRET,
            });
            console.log(
              `[GitHub] ✓ Webhook registered for ${owner}/${repo} (ID: ${webhook.id})`,
            );
          } catch (error) {
            console.error(
              `[GitHub] ✗ Failed to setup webhook for ${owner}/${repo}:`,
              error,
            );
          }
          break;
        }

        default: {
          // Register webhooks for all accessible repositories
          console.log(
            "[GitHub] Setting up webhooks for all accessible repositories...",
          );

          let repositories: Repository[] = [];
          try {
            repositories = await githubClient.listRepositories();
            console.log(
              `[GitHub] Found ${repositories.length} accessible repositories`,
            );
          } catch (error) {
            console.error("[GitHub] Failed to list repositories:", error);
            return;
          }

          let successCount = 0;
          let errorCount = 0;

          for (const repo of repositories) {
            try {
              const webhook = await githubClient.upsertWebhook({
                owner: repo.owner.login,
                repo: repo.name,
                url: webhookUrl,
                events: selectedEvents,
                contentType: "json",
                secret: process.env.GITHUB_WEBHOOK_SECRET,
              });
              console.log(
                `[GitHub] ✓ Webhook registered for ${repo.full_name} (ID: ${webhook.id})`,
              );
              successCount++;
            } catch (error) {
              console.error(
                `[GitHub] ✗ Failed to setup webhook for ${repo.full_name}:`,
                error,
              );
              errorCount++;
            }
          }

          console.log(
            `[GitHub] Webhook setup complete: ${successCount} success, ${errorCount} errors`,
          );
          break;
        }
      }
    },

    // Only need EVENT_BUS scope
    scopes: ["EVENT_BUS::*"],

    // State schema for user configuration
    state: StateSchema,
  },

  tools,
  prompts: [],
});

serve(runtime.fetch);

console.log(`
╔══════════════════════════════════════════════════════════╗
║               GitHub MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  Waiting for OAuth authentication and configuration...   ║
╚══════════════════════════════════════════════════════════╝

📋 Environment Variables:
   GITHUB_CLIENT_ID      - GitHub App Client ID
   GITHUB_CLIENT_SECRET  - GitHub App Client Secret
   GITHUB_APP_NAME       - GitHub App name (default: decocms-bot)
   GITHUB_WEBHOOK_SECRET - Webhook secret (optional)

🎯 Target Options (StateSchema.TARGET):
   ""              - All accessible repositories
   "org:decocms"   - Organization-wide webhook (efficient!)
   "owner/repo"    - Single repository only

🔗 Webhook Endpoint:
   \${meshUrl}/mcp/\${connectionId}/call-tool/GITHUB_WEBHOOK

📡 Events: Configurable via StateSchema (WEBHOOK_EVENTS)
`);
