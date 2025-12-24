/**
 * Registry Binding Implementation
 *
 * Implements COLLECTION_REGISTRY_LIST and COLLECTION_REGISTRY_GET tools
 *
 * Supports two modes:
 * - ALLOWLIST_MODE: Uses pre-generated allowlist for accurate pagination
 * - DYNAMIC_MODE: Filters on-the-fly (may lose items between pages)
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { StateSchema } from "../main.ts";
import {
  listServers,
  getServer,
  getServerVersions,
  parseServerId,
  formatServerId,
  type RegistryServer,
} from "../lib/registry-client.ts";
import { BLACKLISTED_SERVERS } from "../lib/blacklist.ts";
import { ALLOWED_SERVERS } from "../lib/allowlist.ts";
import {
  isServerVerified,
  createMeshMeta,
  applyServerOverrides,
  VERIFIED_SERVERS,
} from "../lib/verified.ts";

/**
 * Inject mcp.mesh metadata into any _meta object
 */
function injectMeshMeta(
  originalMeta: unknown,
  serverName: string,
): Record<string, unknown> {
  const meta =
    typeof originalMeta === "object" && originalMeta !== null
      ? (originalMeta as Record<string, unknown>)
      : {};

  return {
    ...meta,
    "mcp.mesh": createMeshMeta(serverName),
  };
}

/**
 * Process server data: apply overrides for verified servers (icons, repository)
 */
function processServerData(
  serverName: string,
  serverData: unknown,
): Record<string, unknown> {
  const data =
    typeof serverData === "object" && serverData !== null
      ? (serverData as Record<string, unknown>)
      : {};

  // Only apply overrides for verified servers
  if (isServerVerified(serverName)) {
    return applyServerOverrides(serverName, data);
  }

  return data;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Enable allowlist mode for accurate pagination
 * Set to false to use dynamic filtering (original behavior)
 */
const USE_ALLOWLIST_MODE = true;

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema for a collection item - original API data with 4 additional fields
 */
const RegistryServerSchema = z.object({
  id: z.string().describe("Unique item identifier (UUID)"),
  title: z.string().describe("Server name/title"),
  created_at: z.string().describe("Creation timestamp"),
  updated_at: z.string().describe("Last update timestamp"),
  server: z.any().describe("Original server data from API"),
  _meta: z.any().describe("Original metadata from API"),
});

/**
 * Standard WhereExpression schema compatible with @decocms/bindings/collections
 * Note: The API only supports simple text search, so all filters are converted to search terms
 */
const FieldComparisonSchema = z.object({
  field: z.array(z.string()),
  operator: z.enum([
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "startsWith",
    "endsWith",
  ]),
  value: z.unknown(),
});

const WhereExpressionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    FieldComparisonSchema,
    z.object({
      operator: z.enum(["and", "or"]),
      conditions: z.array(WhereExpressionSchema),
    }),
    z.object({
      operator: z.literal("not"),
      condition: WhereExpressionSchema,
    }),
  ]),
);

/**
 * Legacy simplified where schema for easier filtering
 */
const LegacyWhereSchema = z.object({
  appName: z.string().optional().describe("Filter by app name"),
  title: z.string().optional().describe("Filter by server title/name"),
  binder: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Filter by binding type(s)"),
});

const WhereSchema = z
  .union([WhereExpressionSchema, LegacyWhereSchema])
  .describe(
    "Filter expression (supports WhereExpression or legacy {appName, title, binder})",
  );

/**
 * Input schema para LIST
 */
const ListInputSchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .describe(
        "Pagination cursor for fetching next page (e.g., 'ai.exa/exa:3.1.3')",
      ),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe("Number of items per page (default: 30)"),

    where: WhereSchema.optional().describe(
      "Standard WhereExpression filter (converted to simple search internally)",
    ),
    version: z
      .string()
      .optional()
      .default("latest")
      .describe(
        "Filter by specific version (e.g., '1.0.0' or 'latest', default: 'latest')",
      ),
  })
  .describe("Filtering, sorting, and pagination context");

/**
 * Output schema para LIST
 */
const ListOutputSchema = z.object({
  items: z.array(RegistryServerSchema),
  nextCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching next page (use in next request if hasMore is true)",
    ),
});

/**
 * Input schema para GET
 */
const GetInputSchema = z.object({
  id: z
    .string()
    .describe("Server ID (format: 'ai.exa/exa' or 'ai.exa/exa:3.1.1')"),
});

/**
 * Output schema para GET - returns original API format
 */
const GetOutputSchema = z.object({
  server: z.any(),
  _meta: z.any(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract search term from WhereExpression or Legacy format
 * Since API only supports simple text search, we extract the first value found
 */
function extractSearchTerm(where: unknown): string | undefined {
  if (!where || typeof where !== "object") return undefined;

  const w = where as {
    // WhereExpression fields
    operator?: string;
    conditions?: unknown[];
    field?: string[];
    value?: unknown;
    // Legacy fields
    appName?: string;
    title?: string;
    binder?: string | string[];
  };

  // Legacy format - check for appName or title first
  if (w.appName) {
    return w.appName;
  }
  if (w.title) {
    return w.title;
  }

  // WhereExpression format - Field comparison - extract the value
  if (w.field && w.value !== undefined) {
    return String(w.value);
  }

  // AND/OR - extract from first condition that has a value
  if ((w.operator === "and" || w.operator === "or") && w.conditions) {
    for (const condition of w.conditions) {
      const term = extractSearchTerm(condition);
      if (term) return term;
    }
  }

  return undefined;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * ALLOWLIST MODE: Fetch servers by name from the pre-generated allowlist
 * This ensures accurate pagination without losing items
 */
async function listServersFromAllowlist(
  registryUrl: string | undefined,
  startIndex: number,
  limit: number,
  searchTerm: string | undefined,
  version: string,
): Promise<{
  items: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    server: unknown;
    _meta: unknown;
  }>;
  nextCursor?: string;
}> {
  // Get the list of server names to fetch
  // Sort verified servers first, then rest alphabetically
  const verifiedInAllowlist = VERIFIED_SERVERS.filter((name) =>
    ALLOWED_SERVERS.includes(name),
  );
  const nonVerified = ALLOWED_SERVERS.filter((name) => !isServerVerified(name));
  let serverNames = [...verifiedInAllowlist, ...nonVerified];

  // Apply search filter if provided
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    serverNames = serverNames.filter((name) =>
      name.toLowerCase().includes(term),
    );
  }

  // Get the slice for this page
  const endIndex = startIndex + limit;
  const pageNames = serverNames.slice(startIndex, endIndex);

  // Fetch each server in parallel
  // Note: version="latest" means get latest, so we pass undefined to getServer
  const versionToFetch = version === "latest" ? undefined : version;

  const serverPromises = pageNames.map(async (name) => {
    try {
      const server = await getServer(name, versionToFetch, registryUrl);
      return server;
    } catch {
      // Server not found or error - skip it
      return null;
    }
  });

  const servers = await Promise.all(serverPromises);

  // Filter out nulls and map to output format
  const items = servers
    .filter((s): s is RegistryServer => s !== null)
    .map((server) => {
      const officialMeta =
        server._meta["io.modelcontextprotocol.registry/official"];

      return {
        id: formatServerId(server.server.name, server.server.version),
        title: server.server.name,
        created_at:
          (officialMeta as { publishedAt?: string })?.publishedAt ||
          new Date().toISOString(),
        updated_at:
          (officialMeta as { updatedAt?: string })?.updatedAt ||
          new Date().toISOString(),
        server: processServerData(server.server.name, server.server),
        _meta: injectMeshMeta(server._meta, server.server.name),
      };
    });

  // Calculate next cursor - only include if there are more items
  const hasMore = endIndex < serverNames.length;

  // Don't include nextCursor in response when there are no more items
  if (hasMore) {
    return { items, nextCursor: String(endIndex) };
  }
  return { items };
}

/**
 * DYNAMIC MODE: Filter servers on-the-fly (may lose items between pages)
 */
async function listServersDynamic(
  registryUrl: string | undefined,
  cursor: string | undefined,
  limit: number,
  searchTerm: string | undefined,
  version: string,
): Promise<{
  items: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    server: unknown;
    _meta: unknown;
  }>;
  nextCursor?: string;
}> {
  const isOfficialRegistry = !registryUrl;
  const excludedWords = ["local", "test", "demo", "example"];
  const hasExcludedWord = (name: string) =>
    excludedWords.some((word) => name.toLowerCase().includes(word));

  const filterServer = (s: RegistryServer) => {
    if (isOfficialRegistry) {
      if (
        !s.server.remotes ||
        !Array.isArray(s.server.remotes) ||
        s.server.remotes.length === 0 ||
        BLACKLISTED_SERVERS.includes(s.server.name) ||
        hasExcludedWord(s.server.name)
      ) {
        return false;
      }
    }
    return true;
  };

  const allFilteredServers: RegistryServer[] = [];
  let currentCursor: string | undefined = cursor;
  let lastNextCursor: string | undefined;

  do {
    const response = await listServers({
      registryUrl,
      cursor: currentCursor,
      limit: Math.max(limit, 30),
      search: searchTerm,
      version,
    });

    const filtered = response.servers.filter(filterServer);
    allFilteredServers.push(...filtered);

    lastNextCursor = response.metadata.nextCursor;
    currentCursor = lastNextCursor;
  } while (allFilteredServers.length < limit && lastNextCursor);

  const items = allFilteredServers.slice(0, limit).map((server) => {
    const officialMeta =
      server._meta["io.modelcontextprotocol.registry/official"];

    return {
      id: formatServerId(server.server.name, server.server.version),
      title: server.server.name,
      created_at:
        (officialMeta as { publishedAt?: string })?.publishedAt ||
        new Date().toISOString(),
      updated_at:
        (officialMeta as { updatedAt?: string })?.updatedAt ||
        new Date().toISOString(),
      server: processServerData(server.server.name, server.server),
      _meta: injectMeshMeta(server._meta, server.server.name),
    };
  });

  // Don't include nextCursor when there are no more items
  if (lastNextCursor) {
    return { items, nextCursor: lastNextCursor };
  }
  return { items };
}

/**
 * COLLECTION_REGISTRY_LIST - Lists all servers from the registry
 */
export const createListRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_APP_LIST",
    description:
      "Lists MCP servers available in the registry with support for pagination, search, and boolean filters (has_remotes, has_packages, is_latest, etc.)",
    inputSchema: ListInputSchema,
    outputSchema: ListOutputSchema,
    execute: async ({ context }: { context: any }) => {
      const {
        limit = 30,
        cursor,
        where,
        version = "latest",
      } = context as z.infer<typeof ListInputSchema>;
      try {
        // Get registry URL from configuration
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Extract search term from where clause
        const apiSearch = where ? extractSearchTerm(where) : undefined;

        // Use allowlist mode for official registry (no custom registryUrl)
        const useAllowlist = USE_ALLOWLIST_MODE && !registryUrl;

        if (useAllowlist) {
          // ALLOWLIST MODE: Use pre-generated list for accurate pagination
          // Cursor is the index in the allowlist
          const startIndex = cursor ? parseInt(cursor, 10) : 0;
          return await listServersFromAllowlist(
            registryUrl,
            startIndex,
            limit,
            apiSearch,
            version,
          );
        } else {
          // DYNAMIC MODE: Filter on-the-fly (original behavior)
          return await listServersDynamic(
            registryUrl,
            cursor,
            limit,
            apiSearch,
            version,
          );
        }
      } catch (error) {
        throw new Error(
          `Error listing servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });

/**
 * COLLECTION_REGISTRY_GET - Gets a specific server from the registry
 */
export const createGetRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_APP_GET",
    description:
      "Gets a specific MCP server from the registry by ID (format: 'name' or 'name@version')",
    inputSchema: GetInputSchema,
    outputSchema: GetOutputSchema,
    execute: async ({ context }: { context: any }) => {
      const id = context?.id;
      try {
        if (!id) {
          throw new Error("Server ID not provided");
        }
        // Parse ID
        const { name, version } = parseServerId(id);

        // Get registry URL from configuration
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Fetch from API
        const server = await getServer(name, version, registryUrl);

        if (!server) {
          throw new Error(`Server not found: ${id}`);
        }

        // Return with mesh metadata and overrides
        return {
          server: processServerData(server.server.name, server.server),
          _meta: injectMeshMeta(server._meta, server.server.name),
        };
      } catch (error) {
        throw new Error(
          `Error getting server: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });

/**
 * COLLECTION_REGISTRY_APP_VERSIONS - Lists all versions of a specific server
 */
export const createVersionsRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_APP_VERSIONS",
    description:
      "Lists all available versions of a specific MCP server from the registry",
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          "Server name to list versions for (e.g., 'ai.exa/exa' or 'com.example/my-server')",
        ),
    }),
    outputSchema: z.object({
      versions: z
        .array(RegistryServerSchema)
        .describe("Array of all available versions for the server"),
      count: z.number().describe("Total number of versions available"),
    }),
    execute: async ({ context }: { context: any }) => {
      const name = context?.name;
      try {
        if (!name) {
          throw new Error("Server name not provided");
        }

        // Get registry URL from configuration
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Fetch from API
        const serverVersions = await getServerVersions(name, registryUrl);

        // Map servers to output format with ID and mesh metadata
        const versions = serverVersions.map((server) => {
          const officialMeta =
            server._meta["io.modelcontextprotocol.registry/official"];

          return {
            id: formatServerId(server.server.name, server.server.version),
            title: server.server.name,
            created_at: officialMeta?.publishedAt || new Date().toISOString(),
            updated_at: officialMeta?.updatedAt || new Date().toISOString(),
            server: processServerData(server.server.name, server.server),
            _meta: injectMeshMeta(server._meta, server.server.name),
          };
        });

        return {
          versions,
          count: versions.length,
        };
      } catch (error) {
        throw new Error(
          `Error listing server versions: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });
