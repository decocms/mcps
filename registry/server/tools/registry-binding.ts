/**
 * Registry Binding Implementation
 *
 * Implements COLLECTION_REGISTRY_LIST and COLLECTION_REGISTRY_GET tools
 *
 * Uses Supabase as the single source of truth for all MCP server data
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  createSupabaseClient,
  getAvailableFilters as getAvailableFiltersFromSupabase,
  getServer as getServerFromSupabase,
  getServerVersions as getServerVersionsFromSupabase,
  listServers as listServersFromSupabase,
} from "../lib/supabase-client.ts";
import type { Env } from "../main.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Server data schema - flexible to accept data from Supabase
 */
const ServerDataSchema = z
  .record(z.string(), z.unknown())
  .describe("Server data");

/**
 * Meta data schema - flexible to accept metadata
 */
const MetaDataSchema = z.record(z.string(), z.unknown()).describe("Metadata");

/**
 * Schema for a collection item
 */
const RegistryServerSchema = z.object({
  id: z.string().describe("Unique item identifier (UUID)"),
  title: z.string().describe("Server name/title"),
  created_at: z.string().describe("Creation timestamp"),
  updated_at: z.string().describe("Last update timestamp"),
  server: ServerDataSchema,
  _meta: MetaDataSchema,
});

/**
 * WhereExpression schema - using z.unknown() to avoid deep type instantiation
 */
const WhereExpressionSchema = z.unknown();

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
 *
 * Note: This tool always returns the latest version of each server (is_latest: true).
 * To get all versions of a server, use COLLECTION_REGISTRY_APP_VERSIONS.
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
    tags: z
      .array(z.string())
      .optional()
      .describe(
        "Filter by tags (returns servers that have ANY of the specified tags)",
      ),
    categories: z
      .array(z.string())
      .optional()
      .describe(
        "Filter by categories (returns servers that have ANY of the specified categories). Valid categories: productivity, development, data, ai, communication, infrastructure, security, monitoring, analytics, automation",
      ),
    verified: z
      .boolean()
      .optional()
      .describe("Filter by verification status (true = verified only)"),
    hasRemote: z
      .boolean()
      .optional()
      .describe("Filter servers that support remote execution"),
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
    .describe(
      "Server name (format: 'ai.exa/exa' or 'ai.exa/exa@3.1.1'). Note: version suffix is ignored, always returns latest version.",
    ),
});

/**
 * Output schema para GET
 */
const GetOutputSchema = z.object({
  server: ServerDataSchema.describe("Server data"),
  _meta: MetaDataSchema.describe("Metadata"),
});

/**
 * Input schema for VERSIONS
 */
const VersionsInputSchema = z.object({
  name: z
    .string()
    .describe(
      "Server name to list versions for (e.g., 'ai.exa/exa' or 'com.example/my-server')",
    ),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract search term from WhereExpression or Legacy format
 */
function extractSearchTerm(where: unknown): string | undefined {
  if (!where || typeof where !== "object") return undefined;

  const w = where as {
    operator?: string;
    conditions?: unknown[];
    field?: string[];
    value?: unknown;
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

/**
 * Parse server ID into name and version
 */
function parseServerId(id: string): { name: string; version?: string } {
  const separator = "@";
  const parts = id.split(separator);

  if (parts.length === 1) {
    return {
      name: parts[0],
      version: undefined,
    };
  }

  const version = parts[parts.length - 1];
  const name = parts.slice(0, -1).join(separator);

  return {
    name,
    version,
  };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_REGISTRY_LIST - Lists all servers from Supabase
 */
export const createListRegistryTool = (_env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_APP_LIST",
    description:
      "Lists MCP servers available in the registry with support for pagination, search, and filters (tags, categories, verified, hasRemote). Always returns the latest version of each server.",
    inputSchema: ListInputSchema,
    outputSchema: ListOutputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof ListInputSchema>;
    }) => {
      const { limit = 30, cursor, where, tags, categories, verified } = context;
      try {
        // Get configuration from environment
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          );
        }

        // Extract search term from where clause
        const apiSearch = where ? extractSearchTerm(where) : undefined;

        // Query directly from Supabase
        const offset = cursor ? parseInt(cursor, 10) : 0;
        const client = createSupabaseClient(supabaseUrl, supabaseKey);

        const result = await listServersFromSupabase(client, {
          limit,
          offset,
          search: apiSearch,
          tags,
          categories,
          verified,
        });

        const items = result.servers.map((server) => ({
          id: `${server.server.name}@${server.server.version}`,
          title: server.server.name,
          created_at:
            server._meta["io.modelcontextprotocol.registry/official"]
              ?.publishedAt || new Date().toISOString(),
          updated_at:
            server._meta["io.modelcontextprotocol.registry/official"]
              ?.updatedAt || new Date().toISOString(),
          server: server.server,
          _meta: server._meta,
        }));

        // Calculate next cursor
        if (result.hasMore) {
          return { items, nextCursor: String(offset + limit) };
        }
        return { items };
      } catch (error) {
        throw new Error(
          `Error listing servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });

/**
 * COLLECTION_REGISTRY_GET - Gets a specific server from Supabase
 *
 * Note: This tool always returns the LATEST version (is_latest: true).
 * The version suffix in 'name@version' is accepted but ignored.
 * To get all versions of a server, use COLLECTION_REGISTRY_APP_VERSIONS.
 */
export const createGetRegistryTool = (_env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_APP_GET",
    description:
      "Gets the latest version of a specific MCP server from the registry by name (accepts 'name' or 'name@version', but always returns latest)",
    inputSchema: GetInputSchema,
    outputSchema: GetOutputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GetInputSchema>;
    }) => {
      const { id } = context;
      try {
        // Parse ID
        const { name } = parseServerId(id);

        // Get configuration from environment
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          );
        }

        // Query directly from Supabase
        const client = createSupabaseClient(supabaseUrl, supabaseKey);
        const server = await getServerFromSupabase(client, name);

        if (!server) {
          throw new Error(`Server not found: ${id}`);
        }

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
export const createVersionsRegistryTool = (_env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_APP_VERSIONS",
    description:
      "Lists all available versions of a specific MCP server from the registry",
    inputSchema: VersionsInputSchema,
    outputSchema: z.object({
      versions: z
        .array(RegistryServerSchema)
        .describe("Array of all available versions for the server"),
      count: z.number().describe("Total number of versions available"),
    }),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof VersionsInputSchema>;
    }) => {
      const { name } = context;
      try {
        // Get configuration from environment
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          );
        }

        // Query directly from Supabase
        const client = createSupabaseClient(supabaseUrl, supabaseKey);
        const serverVersions = await getServerVersionsFromSupabase(
          client,
          name,
        );

        const versions = serverVersions.map((server) => ({
          id: `${server.server.name}@${server.server.version}`,
          title: server.server.name,
          created_at:
            server._meta["io.modelcontextprotocol.registry/official"]
              ?.publishedAt || new Date().toISOString(),
          updated_at:
            server._meta["io.modelcontextprotocol.registry/official"]
              ?.updatedAt || new Date().toISOString(),
          server: server.server,
          _meta: server._meta,
        }));

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

/**
 * COLLECTION_REGISTRY_APP_FILTERS - Get available filter options
 */
export const createFiltersRegistryTool = (_env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_APP_FILTERS",
    description:
      "Gets all available tags and categories that can be used to filter MCP servers, with counts showing how many servers use each filter value",
    inputSchema: z.object({}),
    outputSchema: z.object({
      tags: z
        .array(
          z.object({
            value: z.string().describe("Tag name"),
            count: z.number().describe("Number of servers with this tag"),
          }),
        )
        .describe("Available tags sorted by usage count (descending)"),
      categories: z
        .array(
          z.object({
            value: z.string().describe("Category name"),
            count: z.number().describe("Number of servers in this category"),
          }),
        )
        .describe("Available categories sorted by usage count (descending)"),
    }),
    execute: async () => {
      try {
        // Get configuration from environment
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          );
        }

        // Query directly from Supabase
        const client = createSupabaseClient(supabaseUrl, supabaseKey);
        const filters = await getAvailableFiltersFromSupabase(client);

        return filters;
      } catch (error) {
        throw new Error(
          `Error getting available filters: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  });
