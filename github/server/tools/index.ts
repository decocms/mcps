/**
 * GitHub MCP Tools
 *
 * Upstream tools are discovered lazily on first request (needs env/secrets
 * which aren't available at module-init on Cloudflare Workers). Trigger
 * tools come from the @decocms/runtime triggers SDK and are static.
 */

import { buildUpstreamTools, getUpstreamToolDefs } from "../lib/mcp-proxy.ts";
import { triggers } from "../lib/trigger-store.ts";
import { createGetCheckRunTool } from "./get-check-run.ts";
import { createGetPreviewDeploymentTool } from "./get-preview-deployment.ts";
import { createMintRepoTokenTool } from "./mint-repo-token.ts";

/**
 * Resolve the full tool set. Cached for the isolate's lifetime once
 * upstream discovery succeeds (caching happens inside getUpstreamToolDefs).
 *
 * Beyond the proxied upstream tools and trigger tools, we add first-party
 * tools that either need the GitHub App private key (which only this MCP holds)
 * or fill a gap in the minimal upstream shapes:
 *   - MINT_REPO_TOKEN: mint a repo-scoped, least-privilege installation token.
 *   - GET_CHECK_RUN: read a check run's full output (the upstream
 *     get_check_runs omits it).
 *   - GET_PREVIEW_DEPLOYMENT: resolve a commit's preview url from its GitHub
 *     Deployments (upstream pull_request_read has no deployments method).
 */
export async function getTools() {
  const toolDefs = await getUpstreamToolDefs();
  return [
    ...buildUpstreamTools(toolDefs),
    ...triggers.tools(),
    createMintRepoTokenTool(),
    createGetCheckRunTool(),
    createGetPreviewDeploymentTool(),
  ];
}
