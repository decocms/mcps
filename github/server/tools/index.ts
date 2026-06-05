/**
 * GitHub MCP Tools
 *
 * Upstream tools are discovered lazily on first request (needs env/secrets
 * which aren't available at module-init on Cloudflare Workers). Trigger
 * tools come from the @decocms/runtime triggers SDK and are static.
 */

import { buildUpstreamTools, getUpstreamToolDefs } from "../lib/mcp-proxy.ts";
import { triggers } from "../lib/trigger-store.ts";
import { createMintRepoTokenTool } from "./mint-repo-token.ts";

/**
 * Resolve the full tool set. Cached for the isolate's lifetime once
 * upstream discovery succeeds (caching happens inside getUpstreamToolDefs).
 *
 * Beyond the proxied upstream tools and trigger tools, we add first-party
 * tools that need the GitHub App private key — which only this MCP holds:
 *   - MINT_REPO_TOKEN: mint a repo-scoped, least-privilege installation token.
 */
export async function getTools() {
  const toolDefs = await getUpstreamToolDefs();
  return [
    ...buildUpstreamTools(toolDefs),
    ...triggers.tools(),
    createMintRepoTokenTool(),
  ];
}
