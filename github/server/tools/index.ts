/**
 * GitHub MCP Tools
 *
 * Upstream tools are discovered lazily on first request (needs env/secrets
 * which aren't available at module-init on Cloudflare Workers). Trigger
 * tools come from the @decocms/runtime triggers SDK and are static.
 */

import { buildUpstreamTools, getUpstreamToolDefs } from "../lib/mcp-proxy.ts";
import { triggers } from "../lib/trigger-store.ts";

/**
 * Resolve the full tool set. Cached for the isolate's lifetime once
 * upstream discovery succeeds (caching happens inside getUpstreamToolDefs).
 */
export async function getTools() {
  const toolDefs = await getUpstreamToolDefs();
  return [...buildUpstreamTools(toolDefs), ...triggers.tools()];
}
