/**
 * MCP Registry Client
 *
 * HTTP client to fetch data from the official Model Context Protocol Registry API
 */

export interface RegistryServer {
  server: {
    $schema: string;
    name: string;
    description: string;
    title?: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
    version: string;
    packages?: Array<any>;
    remotes?: Array<any>;
    icons?: Array<{
      src: string;
      mimeType?: string;
      theme?: string;
    }>;
    websiteUrl?: string;
    [key: string]: any; // Allow any other fields that might come from API
  };
  _meta: {
    [key: string]: any; // Allow any meta structure from different sources
    "io.modelcontextprotocol.registry/official"?: {
      status: string;
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
  };
}

export interface RegistryResponse {
  servers: RegistryServer[];
  metadata: {
    nextCursor?: string;
    count: number;
  };
}

const DEFAULT_REGISTRY_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers";
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Options for fetching servers from registry
 */
export interface ListServersOptions {
  registryUrl?: string;
  cursor?: string;
  limit?: number;
  search?: string;
  version?: string;
}

/**
 * Fetches list of servers from registry with cursor-based pagination support
 */
export async function listServers(
  options: ListServersOptions | string = {},
  cursorLegacy?: string,
): Promise<RegistryResponse> {
  // Support legacy usage: listServers(registryUrl, cursor)
  const opts =
    typeof options === "string"
      ? { registryUrl: options, cursor: cursorLegacy }
      : options;

  const url = new URL(opts.registryUrl || DEFAULT_REGISTRY_URL);

  if (opts.cursor) {
    url.searchParams.append("cursor", opts.cursor);
  }
  if (opts.limit) {
    url.searchParams.append("limit", String(opts.limit));
  }
  if (opts.search) {
    url.searchParams.append("search", opts.search);
  }
  if (opts.version) {
    url.searchParams.append("version", opts.version);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Registry API returned status ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as RegistryResponse;
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout to registry (30s)");
      }
      throw new Error(`Error fetching registry data: ${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches a specific server by name and optional version
 *
 * @param name - Server name (e.g., "ai.exa/exa")
 * @param version - Specific version (e.g., "3.1.1"). If not provided, returns the latest
 * @param registryUrl - Custom registry URL (optional)
 */
export async function getServer(
  name: string,
  version?: string,
  registryUrl?: string,
): Promise<RegistryServer | null> {
  try {
    const response = await listServers({
      registryUrl,
      search: name,
      limit: 100, // Fetch enough to find all versions of this server
    });

    // Filter by exact name match
    const matchingServers = response.servers.filter(
      (s) => s.server.name === name,
    );

    if (matchingServers.length === 0) {
      return null;
    }

    // If version was specified, find exact match
    if (version) {
      return matchingServers.find((s) => s.server.version === version) || null;
    }

    // Otherwise, return the latest (isLatest: true)
    const latest = matchingServers.find(
      (s) => s._meta["io.modelcontextprotocol.registry/official"]?.isLatest,
    );

    return latest || matchingServers[0];
  } catch (error) {
    throw new Error(
      `Error fetching server ${name}${version ? `:${version}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parse um ID no formato "name" ou "name:version"
 */
export function parseServerId(id: string): { name: string; version?: string } {
  const parts = id.split(":");
  return {
    name: parts[0],
    version: parts[1],
  };
}
