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
  "io.github.timescale/pg-aiguide",
  "com.supabase/mcp",
  "com.microsoft/microsoft-learn-mcp",
];

/**
 * Server overrides for verified MCPs
 * Use this to add icons/repository when the server doesn't have them
 */
export interface ServerOverride {
  icons?: Array<{ src: string; mimeType?: string; theme?: string }>;
  repository?: { url: string; source?: string };
}

export const VERIFIED_SERVER_OVERRIDES: Record<string, ServerOverride> = {
  "io.github.github/github-mcp-server": {
    icons: [{ src: "https://github.githubassets.com/favicons/favicon.svg" }],
  },
  "com.stripe/mcp": {
    icons: [{ src: "https://stripe.com/img/v3/home/twitter.png" }],
  },
  "com.notion/mcp": {
    icons: [{ src: "https://www.notion.so/images/favicon.ico" }],
  },
  "com.cloudflare.mcp/mcp": {
    icons: [{ src: "https://www.cloudflare.com/favicon.ico" }],
  },
  "com.vercel/vercel-mcp": {
    icons: [{ src: "https://vercel.com/favicon.ico" }],
  },
  "io.prisma/mcp": {
    icons: [{ src: "https://www.prisma.io/images/favicon-32x32.png" }],
  },
  "com.gitlab/mcp": {
    icons: [{ src: "https://about.gitlab.com/ico/favicon.ico" }],
  },
  "com.postman/postman-mcp-server": {
    icons: [{ src: "https://www.postman.com/favicon.ico" }],
  },
  "com.apify/apify-mcp-server": {
    icons: [{ src: "https://apify.com/favicon.ico" }],
  },
  "ai.exa/exa": {
    icons: [{ src: "https://exa.ai/favicon.ico" }],
  },
  "io.github.perplexityai/mcp-server": {
    icons: [{ src: "https://www.perplexity.ai/favicon.ico" }],
  },
  "com.atlassian/atlassian-mcp-server": {
    icons: [
      {
        src: "https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png",
      },
    ],
  },
  "com.linear/linear": {
    icons: [{ src: "https://linear.app/favicon.ico" }],
  },
};

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

/**
 * Get server override if exists
 */
export function getServerOverride(
  serverName: string,
): ServerOverride | undefined {
  return VERIFIED_SERVER_OVERRIDES[serverName];
}

/**
 * Apply overrides to a server object (only if icons/repository are missing)
 * Returns a new server object with overrides applied
 */
export function applyServerOverrides(
  serverName: string,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const override = getServerOverride(serverName);
  if (!override) return server;

  const result = { ...server };

  // Apply icons override if server doesn't have icons
  const existingIcons = server.icons as unknown[] | undefined;
  if (override.icons && (!existingIcons || existingIcons.length === 0)) {
    result.icons = override.icons;
  }

  // Apply repository override if server doesn't have repository
  if (override.repository && !server.repository) {
    result.repository = override.repository;
  }

  return result;
}
