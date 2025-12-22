/**
 * Blacklist of MCP servers that should be excluded from listings
 * Add server names here to filter them out from the registry results
 */

export const BLACKLISTED_SERVERS: string[] = [
  // Add server names here that you want to exclude
  // Examples:
  // "com.example/broken-server",
  // "ai.vendor/non-functional-mcp",
  "com.figma.mcp/mcp", // CORS error
  "io.github.microsoft/EnterpriseMCP", // error "Authentication failed: Incompatible auth server: does not support dynamic client registration" but have support
  "ai.smithery/exa-labs-exa-code-mcp", // error "Authentication failed: Incompatible auth server: does not support dynamic client registration" but have support
];
