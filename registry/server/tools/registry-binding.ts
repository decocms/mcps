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
    where: z.record(z.unknown()).optional(),
    orderBy: z
      .array(
        z.object({
          field: z.array(z.string()),
          direction: z.enum(["asc", "desc"]).optional().default("asc"),
        }),
      )
      .optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    cursor: z.string().optional(),
  })
  .describe("Filtering, sorting, and pagination context");

/**
 * Output schema para LIST
 */
const ListOutputSchema = z.object({
  items: z.array(RegistryServerSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
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
      const { where, orderBy, limit, offset } = context as z.infer<
        typeof ListInputSchema
      >;
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

        // Apply pagination
        const finalLimit = limit || 50;
        const finalOffset = offset || 0;
        const paginatedServers = servers.slice(
          finalOffset,
          finalOffset + finalLimit,
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

        // Calculate if there are more items
        const hasMore = finalOffset + paginatedServers.length < servers.length;

        return {
          items,
          totalCount: servers.length,
          hasMore,
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
