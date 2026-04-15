/**
 * GitHub MCP Tools
 *
 * Upstream tools are discovered at startup via GitHub App auth.
 * Trigger tools come from the @decocms/runtime triggers SDK.
 * Both are resolved before the server starts accepting requests.
 */

import { upstreamToolDefsReady, buildUpstreamTools } from "../lib/mcp-proxy.ts";
import { triggers } from "../lib/trigger-store.ts";

const toolDefs = await upstreamToolDefsReady;

export const tools = [...buildUpstreamTools(toolDefs), ...triggers.tools()];
