/**
 * GitHub Repo Reports — MCP Server
 *
 * Implements the Reports Binding by reading Markdown files with YAML
 * frontmatter from a configurable GitHub repository. Uses GitHub App
 * OAuth for authentication and supports directory nesting as tags.
 *
 * Required tools: REPORTS_LIST, REPORTS_GET
 * Optional tools: REPORTS_UPDATE_STATUS
 */

import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { exchangeCodeForToken } from "./lib/github-client.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

// ---------------------------------------------------------------------------
// GitHub OAuth configuration from environment
// ---------------------------------------------------------------------------

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_APP_NAME = process.env.GITHUB_APP_NAME || "decocms-bot";

// ---------------------------------------------------------------------------
// MCP Runtime
// ---------------------------------------------------------------------------

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://github.com",

    /**
     * Generate the authorization URL for GitHub App installation.
     *
     * Uses /installations/select_target so the user can choose which
     * organisation / account (and repositories) to grant access to.
     */
    authorizationUrl: (callbackUrl) => {
      const url = new URL(
        `https://github.com/apps/${GITHUB_APP_NAME}/installations/select_target`,
      );

      // Preserve the CSRF state parameter from the callback URL
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    /**
     * Exchange the authorization code for a GitHub access token.
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

      console.log("[github-repo-reports] Token exchange successful");

      return {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
      };
    },
  },

  configuration: {
    state: StateSchema,
  },

  tools,
  prompts: [],
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

serve(runtime.fetch);

console.log(`
GitHub Repo Reports MCP Server Started

Environment Variables:
  GITHUB_CLIENT_ID      - GitHub App Client ID
  GITHUB_CLIENT_SECRET  - GitHub App Client Secret
  GITHUB_APP_NAME       - GitHub App name (default: decocms-bot)

Configuration (StateSchema):
  REPO   - Target repository ("owner/repo")
  PATH   - Reports directory path (default: "reports")
  BRANCH - Git branch (default: "reports")

Reports Binding Tools:
  REPORTS_LIST          - List reports with optional filters
  REPORTS_GET           - Get a single report with full content
  REPORTS_UPDATE_STATUS - Update lifecycle status (unread/read/dismissed)
`);
