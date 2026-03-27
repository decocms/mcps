/**
 * GitHub MCP Tools
 *
 * All tools come from the upstream MCP server via the proxy,
 * plus trigger tools from the @decocms/runtime triggers SDK.
 */

import { createUpstreamToolsProvider } from "../lib/mcp-proxy.ts";
import { triggers } from "../lib/trigger-store.ts";

export const tools = [createUpstreamToolsProvider(), () => triggers.tools()];
