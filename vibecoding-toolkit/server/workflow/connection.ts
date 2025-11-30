/**
 * Integration Connection Utilities
 *
 * Helpers for creating MCP proxy connections to integrations.
 */

const API_BASE = "https://api.decocms.com";

interface ConnectionOptions {
  workspace: string;
  token: string;
}

/**
 * Normalize workspace path to standard format
 */
function normalizeWorkspace(workspace: string): string {
  if (
    workspace.startsWith("/users") ||
    workspace.startsWith("/shared") ||
    workspace.includes("/")
  ) {
    return workspace;
  }
  return `/shared/${workspace}`;
}

/**
 * Create an HTTP proxy connection to an integration
 */
export function createProxyConnection(
  integrationId: string,
  opts: ConnectionOptions,
) {
  return {
    type: "HTTP",
    url: new URL(
      `${normalizeWorkspace(opts.workspace)}/${integrationId}/mcp`,
      API_BASE,
    ).href,
    token: opts.token,
  };
}
