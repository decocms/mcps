/**
 * Registry Binding Implementation
 *
 * Implements COLLECTION_REGISTRY_LIST and COLLECTION_REGISTRY_GET tools
 * to access the Model Context Protocol Registry
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { StateSchema } from "../main.ts";
import {
  listAllServers,
  getServer,
  parseServerId,
} from "../lib/registry-client.ts";

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
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe("Number of items per page (default: 30)"),
    search: z
      .string()
      .optional()
      .describe(
        "Search servers by name using substring match (e.g., 'filesystem')",
      ),
    updated_since: z
      .string()
      .optional()
      .describe(
        "Filter servers updated since timestamp (RFC3339 datetime, e.g., '2025-08-07T13:15:04.280Z')",
      ),
    version: z
      .string()
      .default("latest")
      .describe(
        "Filter by version ('latest' for latest version, or exact version like '1.2.3')",
      ),
    where: z.record(z.unknown()).optional(),
    orderBy: z
      .array(
        z.object({
          field: z.array(z.string()),
          direction: z.enum(["asc", "desc"]).optional().default("asc"),
        }),
      )
      .optional(),
    offset: z.number().optional(),
  })
  .describe("Filtering, sorting, and pagination context");

/**
 * Output schema para LIST
 */
const ListOutputSchema = z.object({
  items: z.array(RegistryServerSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
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
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_REGISTRY_LIST - Lists all servers from the registry
 */
export const createListRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_APP_LIST",
    description:
      "Lists all MCP servers available in the registry with support for filtering, sorting, and pagination",
    inputSchema: ListInputSchema,
    outputSchema: ListOutputSchema,
    execute: async ({ context }: { context: any }) => {
      const {
        where,
        orderBy,
        limit,
        offset,
        cursor,
        search,
        updated_since,
        version,
      } = context as z.infer<typeof ListInputSchema>;
      try {
        // Get registry URL from configuration
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Fetch all servers from registry
        let servers = await listAllServers(registryUrl);

        // Helper to extract value from meta generically (works with any meta structure)
        const getMetaValue = (meta: any, key: string): any => {
          if (!meta || typeof meta !== "object") return undefined;
          const metaKeys = Object.keys(meta);
          for (const metaKey of metaKeys) {
            const metaObj = meta[metaKey];
            if (metaObj && typeof metaObj === "object" && metaObj[key]) {
              return metaObj[key];
            }
          }
          return undefined;
        };

        // Apply filters (if needed - basic implementation)
        if (where) {
          servers = servers.filter((server) => {
            for (const [key, value] of Object.entries(where)) {
              // Simple filtering on server.name for now
              if (key === "name" && server.server.name !== value) {
                return false;
              }
            }
            return true;
          });
        }

        // Apply search filter (substring match on server name)
        if (search) {
          const searchLower = search.toLowerCase();
          servers = servers.filter((server) =>
            server.server.name.toLowerCase().includes(searchLower),
          );
        }

        // Apply version filter
        if (version && version !== "latest") {
          servers = servers.filter(
            (server) => server.server.version === version,
          );
        } else if (version === "latest") {
          // Keep only latest versions (one per name)
          const latestByName = new Map<string, (typeof servers)[0]>();
          for (const server of servers) {
            const name = server.server.name;
            const current = latestByName.get(name);
            if (!current) {
              latestByName.set(name, server);
            } else {
              // Keep the one marked as latest, or the most recently updated
              const currentIsLatest = getMetaValue(current._meta, "isLatest");
              const serverIsLatest = getMetaValue(server._meta, "isLatest");

              if (serverIsLatest && !currentIsLatest) {
                latestByName.set(name, server);
              } else if (!serverIsLatest && !currentIsLatest) {
                // Compare by updatedAt timestamp
                const currentUpdated = getMetaValue(current._meta, "updatedAt");
                const serverUpdated = getMetaValue(server._meta, "updatedAt");
                if (
                  serverUpdated &&
                  new Date(serverUpdated) >
                    new Date(currentUpdated || "1970-01-01")
                ) {
                  latestByName.set(name, server);
                }
              }
            }
          }
          servers = Array.from(latestByName.values());
        }

        // Apply updated_since filter (RFC3339 timestamp)
        if (updated_since) {
          const sinceDatetime = new Date(updated_since);
          servers = servers.filter((server) => {
            const updatedAt = getMetaValue(server._meta, "updatedAt");
            if (!updatedAt) return true; // Include if no updatedAt info
            return new Date(updatedAt) >= sinceDatetime;
          });
        }

        // Apply sorting (if needed - basic implementation)
        if (orderBy && orderBy.length > 0) {
          const order = orderBy[0];
          const field = order.field[0];
          const direction = order.direction === "desc" ? -1 : 1;

          servers.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            if (field === "name") {
              aVal = a.server.name;
              bVal = b.server.name;
            } else if (field === "publishedAt" || field === "created_at") {
              aVal =
                getMetaValue(a._meta, "publishedAt") ||
                getMetaValue(a._meta, "createdAt");
              bVal =
                getMetaValue(b._meta, "publishedAt") ||
                getMetaValue(b._meta, "createdAt");
            } else if (field === "updatedAt" || field === "updated_at") {
              aVal = getMetaValue(a._meta, "updatedAt");
              bVal = getMetaValue(b._meta, "updatedAt");
            } else {
              return 0;
            }

            if (aVal === bVal) return 0;
            if (aVal < bVal) return -1 * direction;
            return 1 * direction;
          });
        }

        // Apply pagination with cursor support
        let startIndex = 0;

        if (cursor) {
          // Find the position after the cursor item
          const [cursorName, cursorVersion] = cursor.split(":");
          startIndex = servers.findIndex(
            (s) =>
              s.server.name === cursorName &&
              s.server.version === cursorVersion,
          );
          // Start after the cursor item
          if (startIndex !== -1) {
            startIndex += 1;
          } else {
            startIndex = 0; // If cursor not found, start from beginning
          }
        } else if (offset !== undefined) {
          // Fall back to offset if no cursor
          startIndex = offset;
        }

        const finalLimit = limit;
        const paginatedServers = servers.slice(
          startIndex,
          startIndex + finalLimit,
        );

        // Add 4 fields at root, keep original server and _meta unchanged
        const items = paginatedServers.map((server) => {
          // Extract dates from _meta generically (works with any meta structure)
          const created_at =
            getMetaValue(server._meta, "publishedAt") ||
            getMetaValue(server._meta, "createdAt") ||
            new Date().toISOString();
          const updated_at =
            getMetaValue(server._meta, "updatedAt") || new Date().toISOString();

          return {
            id: crypto.randomUUID(),
            title: server.server.name,
            created_at,
            updated_at,
            server: server.server,
            _meta: server._meta,
          };
        });

        // Calculate if there are more items and generate nextCursor
        const hasMore = startIndex + paginatedServers.length < servers.length;
        const nextCursor =
          hasMore && paginatedServers.length > 0
            ? `${paginatedServers[paginatedServers.length - 1].server.name}:${paginatedServers[paginatedServers.length - 1].server.version}`
            : undefined;

        return {
          items,
          totalCount: servers.length,
          hasMore,
          nextCursor,
        };
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
      "Gets a specific MCP server from the registry by ID (format: 'name' or 'name:version')",
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

        // Fetch specific server
        const server = await getServer(name, version, registryUrl);

        if (!server) {
          throw new Error(`Server not found: ${id}`);
        }

        // Return original API format
        return {
          server: server.server,
          _meta: server._meta,
        };
      } catch (error) {
        throw new Error(
          `Error getting server: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });
