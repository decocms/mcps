/**
 * Verified MCP servers by mesh
 *
 * MCPs in this list will have `_meta["mcp.mesh"].verified = true`
 * and appear first in listings.
 *
 * To add a new verified MCP, just add the server name to the array.
 */

export const VERIFIED_SERVERS: string[] = [
  // === Deco MCPs ===
  // Add your verified MCPs here

  // === Official/Popular MCPs ===
  "io.github.github/github-mcp-server",
  "com.stripe/mcp",
  "com.notion/mcp",
  "com.cloudflare.mcp/mcp",
  "com.vercel/vercel-mcp",
  "io.prisma/mcp",
  "com.gitlab/mcp",
  "com.postman/postman-mcp-server",
  "com.apify/apify-mcp-server",
  "ai.exa/exa",
  "io.github.perplexityai/mcp-server",
  "com.atlassian/atlassian-mcp-server",
  "com.linear/linear",
];

/**
 * Set for O(1) lookup
 */
export const VERIFIED_SERVERS_SET = new Set(VERIFIED_SERVERS);

/**
 * Check if a server is verified by mesh
 */
export function isServerVerified(name: string): boolean {
  return VERIFIED_SERVERS_SET.has(name);
}

/**
 * Total count of verified servers
 */
export const VERIFIED_SERVERS_COUNT = VERIFIED_SERVERS.length;

/**
 * MCP Mesh metadata to inject into server responses
 */
export interface McpMeshMeta {
  verified: boolean;
}

/**
 * Create the mcp.mesh metadata for a server
 */
export function createMeshMeta(serverName: string): McpMeshMeta {
  return {
    verified: isServerVerified(serverName),
  };
}
