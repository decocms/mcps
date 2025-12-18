/**
 * Registry Binding Implementation
 *
 * Implements COLLECTION_REGISTRY_LIST and COLLECTION_REGISTRY_GET tools
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

const WhereSchema = WhereExpressionSchema.describe(
  "Standard WhereExpression filter (converted to simple search internally)",
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
 * Extract search term from WhereExpression
 * Since API only supports simple text search, we extract the first value found
 */
function extractSearchTerm(where: unknown): string | undefined {
  if (!where || typeof where !== "object") return undefined;

  const w = where as {
    operator?: string;
    conditions?: unknown[];
    field?: string[];
    value?: unknown;
  };

  // Field comparison - extract the value
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
 * COLLECTION_REGISTRY_LIST - Lists all servers from the registry
 */
export const createListRegistryTool = (env: Env) =>
  createTool({
    id: "COLLECTION_REGISTRY_APP_LIST",
    description:
      "Lists MCP servers available in the registry with support for pagination, search, and version filtering",
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
        // API only supports simple text search, so all filters become search terms
        const apiSearch = where ? extractSearchTerm(where) : undefined;

        // Setup for filtering
        const isOfficialRegistry = !registryUrl;
        const excludedWords = ["local", "test", "demo", "example"];
        const hasExcludedWord = (name: string) =>
          excludedWords.some((word) => name.toLowerCase().includes(word));

        const filterServer = (s: RegistryServer) => {
          // Basic filters for official registry
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

        // Accumulate filtered servers until we have enough
        const allFilteredServers: RegistryServer[] = [];
        let currentCursor: string | undefined = cursor;
        let lastNextCursor: string | undefined;

        // Keep fetching until we have at least 'limit' items or no more pages
        do {
          const response = await listServers({
            registryUrl,
            cursor: currentCursor,
            limit: 100, // Fetch more items per request to reduce API calls
            search: apiSearch,
            version,
          });

          // Filter servers
          const filtered = response.servers.filter(filterServer);
          allFilteredServers.push(...filtered);

          // Save the next cursor
          lastNextCursor = response.metadata.nextCursor;
          currentCursor = lastNextCursor;

          // Stop if we have enough items or no more pages
        } while (allFilteredServers.length < limit && lastNextCursor);

        // Map servers to output format with ID
        const items = allFilteredServers.slice(0, limit).map((server) => {
          const officialMeta =
            server._meta["io.modelcontextprotocol.registry/official"];

          return {
            id: formatServerId(server.server.name, server.server.version),
            title: server.server.name,
            created_at: officialMeta?.publishedAt || new Date().toISOString(),
            updated_at: officialMeta?.updatedAt || new Date().toISOString(),
            server: server.server,
            _meta: server._meta,
          };
        });

        return {
          items,
          nextCursor: lastNextCursor,
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

        // Fetch all versions
        const serverVersions = await getServerVersions(name, registryUrl);

        // Map servers to output format with ID
        const versions = serverVersions.map((server) => {
          const officialMeta =
            server._meta["io.modelcontextprotocol.registry/official"];

          return {
            id: crypto.randomUUID(),
            title: server.server.name,
            created_at: officialMeta?.publishedAt || new Date().toISOString(),
            updated_at: officialMeta?.updatedAt || new Date().toISOString(),
            server: server.server,
            _meta: server._meta,
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
