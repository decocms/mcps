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
import {
  mapServer,
  applyWhereFilter,
  applySortOrder,
  applyPagination,
} from "../lib/mappers.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema for a registry server (inner server object)
 */
const ServerDataSchema = z.object({
  id: z.string().describe("Unique identifier (name:version)"),
  name: z.string().describe("Server name (e.g., ai.exa/exa)"),
  version: z.string().describe("Server version"),
  description: z.string().describe("Server description"),
  schema: z.string().describe("JSON Schema URL"),
  repository: z
    .object({
      url: z.string().optional(),
      source: z.string().optional(),
      subfolder: z.string().optional(),
    })
    .optional()
    .describe("Repository information"),
  packages: z.array(z.unknown()).optional().describe("Available packages"),
  remotes: z.array(z.unknown()).optional().describe("Available remotes"),
  isLatest: z.boolean().describe("Whether this is the latest version"),
  publishedAt: z.string().describe("Publication date"),
  updatedAt: z.string().describe("Last update date"),
  status: z.string().optional().describe("Server status"),
});

/**
 * Schema for a collection item (wrapper with metadata)
 */
const RegistryServerSchema = z.object({
  id: z.string().describe("Unique item identifier (UUID)"),
  title: z.string().describe("Server name/title"),
  created_at: z.string().describe("Creation timestamp"),
  updated_at: z.string().describe("Last update timestamp"),
  server: ServerDataSchema.describe("Server data"),
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
 * Output schema para GET
 */
const GetOutputSchema = ServerDataSchema;

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_REGISTRY_LIST - Lists all servers from the registry
 */
export const createListRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_LIST",
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
        const servers = await listAllServers(registryUrl);

        // Map to expected format
        let mappedServers = servers.map(mapServer);

        // Apply filters
        if (where) {
          mappedServers = applyWhereFilter(
            mappedServers,
            where as Record<string, unknown>,
          );
        }

        // Apply sorting
        if (orderBy) {
          mappedServers = applySortOrder(mappedServers, orderBy);
        }

        // Apply pagination
        const finalLimit = limit || 50;
        const finalOffset = offset || 0;
        const paginatedServers = applyPagination(
          mappedServers,
          finalLimit,
          finalOffset,
        );

        // Transform to collection item format with wrapper
        const items = paginatedServers.map((server) => ({
          id: crypto.randomUUID(),
          title: server.name,
          created_at: server.publishedAt,
          updated_at: server.updatedAt,
          server,
        }));

        // Calculate if there are more items
        const hasMore =
          finalOffset + paginatedServers.length < mappedServers.length;

        return {
          items,
          totalCount: mappedServers.length,
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
    id: "COLLECTION_REGISTRY_GET",
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

        // Map to expected format
        return mapServer(server);
      } catch (error) {
        throw new Error(
          `Error getting server: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });
