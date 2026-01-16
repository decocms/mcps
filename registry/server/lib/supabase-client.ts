/**
 * Supabase Client for MCP Registry
 *
 * Provides functions to query and manage MCP servers in Supabase.
 * This replaces the need to call the MCP Registry API at runtime.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════
// Types that reflect EXACTLY the database table
// ═══════════════════════════════════════════════════════════════

export interface McpServerRow {
  // Registry data
  name: string;
  version: string;
  schema_url: string | null;
  description: string | null;
  website_url: string | null;
  repository: { url: string; source?: string; subfolder?: string } | null;
  remotes: Array<{ type: string; url: string }> | null;
  packages: Array<{ type: string; name: string; version?: string }> | null;
  icons: Array<{ src: string; mimeType?: string; theme?: string }> | null;
  registry_status: string;
  published_at: string | null;
  registry_updated_at: string | null;
  is_latest: boolean;

  // Mesh data
  friendly_name: string | null;
  short_description: string | null;
  mesh_description: string | null;
  tags: string[] | null;
  categories: string[] | null;
  verified: boolean;
  unlisted: boolean;
  has_oauth: boolean;
  has_remote: boolean;
  is_npm: boolean;
  is_local_repo: boolean;

  // Control
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════
// Registry Server type (API response format)
// ═══════════════════════════════════════════════════════════════

export interface RegistryServer {
  server: {
    $schema: string;
    name: string;
    description: string;
    version: string;
    repository?: { url: string; source?: string; subfolder?: string };
    remotes?: Array<{ type: string; url: string }>;
    packages?: Array<{ type: string; name: string; version?: string }>;
    icons?: Array<{ src: string; mimeType?: string; theme?: string }>;
    websiteUrl?: string;
    [key: string]: unknown;
  };
  _meta: {
    "io.modelcontextprotocol.registry/official"?: {
      status: string;
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
    "mcp.mesh"?: McpMeshMeta;
    [key: string]: unknown;
  };
}

export interface McpMeshMeta {
  friendly_name: string | null;
  short_description: string | null;
  mesh_description: string | null;
  tags: string[] | null;
  categories: string[] | null;
  verified: boolean;
  unlisted: boolean;
  has_oauth: boolean;
  has_remote: boolean;
  is_npm: boolean;
  is_local_repo: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Client Creation
// ═══════════════════════════════════════════════════════════════

export function createSupabaseClient(
  supabaseUrl: string,
  supabaseKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, supabaseKey);
}

// ═══════════════════════════════════════════════════════════════
// Row to API Response Conversion
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json";

export function rowToRegistryServer(row: McpServerRow): RegistryServer {
  return {
    server: {
      $schema: row.schema_url ?? DEFAULT_SCHEMA,
      name: row.name,
      description: row.description ?? "", // Original description from registry
      version: row.version,
      ...(row.repository && { repository: row.repository }),
      ...(row.remotes && { remotes: row.remotes }),
      ...(row.packages && { packages: row.packages }),
      ...(row.icons && { icons: row.icons }),
      ...(row.website_url && { websiteUrl: row.website_url }),
    },
    _meta: {
      "io.modelcontextprotocol.registry/official": {
        status: row.registry_status ?? "active",
        publishedAt: row.published_at ?? new Date().toISOString(),
        updatedAt: row.registry_updated_at ?? new Date().toISOString(),
        isLatest: row.is_latest ?? true,
      },
      "mcp.mesh": {
        friendly_name: row.friendly_name,
        short_description: row.short_description,
        mesh_description: row.mesh_description,
        tags: row.tags,
        categories: row.categories,
        verified: row.verified ?? false,
        unlisted: row.unlisted ?? false,
        has_oauth: row.has_oauth ?? false,
        has_remote: row.has_remote ?? false,
        is_npm: row.is_npm ?? false,
        is_local_repo: row.is_local_repo ?? false,
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Query Options
// ═══════════════════════════════════════════════════════════════

export interface ListServersOptions {
  limit?: number;
  offset?: number;
  search?: string;
  /** Exact name match - when provided, returns only if name matches exactly */
  exactName?: string;
  tags?: string[];
  categories?: string[];
  verified?: boolean;
  hasRemote?: boolean;
  includeUnlisted?: boolean;
}

export interface ListServersResult {
  servers: RegistryServer[];
  count: number;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Query Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize search input to prevent PostgREST query injection
 * Escapes special characters that have meaning in PostgREST queries
 */
function sanitizeSearchInput(input: string): string {
  // Escape special PostgREST characters: , . ( ) * % _ \
  return input
    .replace(/\\/g, "\\\\") // Backslash first
    .replace(/,/g, "\\,") // Comma (separates OR conditions)
    .replace(/\./g, "\\.") // Period (operator separator)
    .replace(/\(/g, "\\(") // Left paren (grouping)
    .replace(/\)/g, "\\)") // Right paren (grouping)
    .replace(/\*/g, "\\*") // Asterisk (wildcard)
    .replace(/%/g, "\\%") // Percent (wildcard in LIKE)
    .replace(/_/g, "\\_"); // Underscore (single-char wildcard in LIKE)
}

/**
 * Build a flexible search query that matches any word in the search term
 * This makes search more forgiving - "github server" will match entries
 * containing "github" OR "server" in any of the searchable fields
 */
function buildSearchFilter(search: string): string {
  // Split search into words, filter empty ones, and take max 5 words
  const words = search
    .toLowerCase()
    .split(/[\s\-_/.]+/)
    .filter((word) => word.length >= 2)
    .slice(0, 5);

  if (words.length === 0) {
    // Fallback to original search if no valid words
    const sanitized = sanitizeSearchInput(search);
    return `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,friendly_name.ilike.%${sanitized}%,short_description.ilike.%${sanitized}%`;
  }

  // Build OR conditions for each word across all searchable fields
  const conditions: string[] = [];

  for (const word of words) {
    const sanitized = sanitizeSearchInput(word);
    // Text fields - partial match
    conditions.push(`name.ilike.%${sanitized}%`);
    conditions.push(`description.ilike.%${sanitized}%`);
    conditions.push(`friendly_name.ilike.%${sanitized}%`);
    conditions.push(`short_description.ilike.%${sanitized}%`);
    // Array fields - exact match (contains)
    conditions.push(`tags.cs.{${sanitized}}`);
    conditions.push(`categories.cs.{${sanitized}}`);
  }

  return conditions.join(",");
}

/**
 * List servers from Supabase with filters
 */
export async function listServers(
  client: SupabaseClient,
  options: ListServersOptions = {},
): Promise<ListServersResult> {
  const {
    limit = 30,
    offset = 0,
    search,
    exactName,
    tags,
    categories,
    verified,
    hasRemote,
    includeUnlisted = false,
  } = options;

  let query = client.from("mcp_servers").select("*", { count: "exact" });

  // ALWAYS filter only the latest version (is_latest: true)
  query = query.eq("is_latest", true);

  // Filter unlisted unless explicitly included
  if (!includeUnlisted) {
    query = query.eq("unlisted", false);
  }

  // Filter by verified
  if (verified !== undefined) {
    query = query.eq("verified", verified);
  }

  // Filter by has_remote
  if (hasRemote !== undefined) {
    query = query.eq("has_remote", hasRemote);
  }

  // Filter by tags (contains any)
  if (tags && tags.length > 0) {
    query = query.overlaps("tags", tags);
  }

  // Filter by categories (contains any)
  if (categories && categories.length > 0) {
    query = query.overlaps("categories", categories);
  }

  // Exact name match - takes precedence over search
  // When exactName is provided, only return if name matches exactly
  if (exactName) {
    query = query.eq("name", exactName);
  }
  // Flexible search - matches any word in any searchable field
  else if (search) {
    const searchFilter = buildSearchFilter(search);
    query = query.or(searchFilter);
  }

  // Order: verified first, then by name
  query = query
    .order("verified", { ascending: false })
    .order("name", { ascending: true });

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Error listing servers from Supabase: ${error.message}`);
  }

  const rows = (data as McpServerRow[]) || [];
  const servers = rows.map(rowToRegistryServer);
  const totalCount = count ?? 0;

  return {
    servers,
    count: totalCount,
    hasMore: offset + rows.length < totalCount,
  };
}

/**
 * Get a single server by name
 */
export async function getServer(
  client: SupabaseClient,
  name: string,
): Promise<RegistryServer | null> {
  const { data, error } = await client
    .from("mcp_servers")
    .select("*")
    .eq("name", name)
    .eq("is_latest", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Error getting server from Supabase: ${error.message}`);
  }

  return data ? rowToRegistryServer(data as McpServerRow) : null;
}

/**
 * Get all versions of a server
 */
export async function getServerVersions(
  client: SupabaseClient,
  name: string,
): Promise<RegistryServer[]> {
  const { data, error } = await client
    .from("mcp_servers")
    .select("*")
    .eq("name", name)
    .order("version", { ascending: false });

  if (error) {
    throw new Error(
      `Error getting server versions from Supabase: ${error.message}`,
    );
  }

  const rows = (data as McpServerRow[]) || [];
  return rows.map(rowToRegistryServer);
}

/**
 * Upsert a server (insert or update)
 */
export async function upsertServer(
  client: SupabaseClient,
  data: Partial<McpServerRow> & { name: string; version: string },
): Promise<void> {
  const { error } = await client
    .from("mcp_servers")
    .upsert(data, { onConflict: "name,version" });

  if (error) {
    throw new Error(`Error upserting server to Supabase: ${error.message}`);
  }
}

/**
 * Upsert multiple servers in batch
 */
export async function upsertServers(
  client: SupabaseClient,
  servers: Array<Partial<McpServerRow> & { name: string; version: string }>,
): Promise<void> {
  // Supabase has a limit of ~1000 rows per upsert, batch if needed
  const BATCH_SIZE = 500;

  for (let i = 0; i < servers.length; i += BATCH_SIZE) {
    const batch = servers.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from("mcp_servers")
      .upsert(batch, { onConflict: "name,version" });

    if (error) {
      throw new Error(
        `Error upserting servers batch to Supabase: ${error.message}`,
      );
    }
  }
}

/**
 * Get available tags and categories from all servers
 */
export async function getAvailableFilters(client: SupabaseClient): Promise<{
  tags: Array<{ value: string; count: number }>;
  categories: Array<{ value: string; count: number }>;
}> {
  // Get all latest servers with their tags and categories
  const { data, error } = await client
    .from("mcp_servers")
    .select("tags, categories")
    .eq("is_latest", true)
    .eq("unlisted", false);

  if (error) {
    throw new Error(`Error fetching available filters: ${error.message}`);
  }

  const servers = (data || []) as Array<{
    tags: string[] | null;
    categories: string[] | null;
  }>;

  // Count tags
  const tagCounts = new Map<string, number>();
  servers.forEach((server) => {
    server.tags?.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });

  // Count categories
  const categoryCounts = new Map<string, number>();
  servers.forEach((server) => {
    server.categories?.forEach((category) => {
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
  });

  // Convert to sorted arrays
  const tags = Array.from(tagCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count); // Sort by count desc

  const categories = Array.from(categoryCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count); // Sort by count desc

  return { tags, categories };
}

/**
 * Get server count by status
 */
export async function getServerStats(client: SupabaseClient): Promise<{
  total: number;
  verified: number;
  withRemote: number;
  withNpm: number;
  unlisted: number;
}> {
  const { data, error } = await client.rpc("get_mcp_server_stats");

  if (error) {
    // Fallback to manual count if RPC doesn't exist
    // ALWAYS filter by is_latest to count only the latest version of each server
    const { count: total } = await client
      .from("mcp_servers")
      .select("*", { count: "exact", head: true })
      .eq("is_latest", true)
      .eq("unlisted", false);

    const { count: verified } = await client
      .from("mcp_servers")
      .select("*", { count: "exact", head: true })
      .eq("is_latest", true)
      .eq("unlisted", false)
      .eq("verified", true);

    const { count: withRemote } = await client
      .from("mcp_servers")
      .select("*", { count: "exact", head: true })
      .eq("is_latest", true)
      .eq("unlisted", false)
      .eq("has_remote", true);

    const { count: withNpm } = await client
      .from("mcp_servers")
      .select("*", { count: "exact", head: true })
      .eq("is_latest", true)
      .eq("unlisted", false)
      .eq("is_npm", true);

    const { count: unlisted } = await client
      .from("mcp_servers")
      .select("*", { count: "exact", head: true })
      .eq("is_latest", true)
      .eq("unlisted", true);

    return {
      total: total ?? 0,
      verified: verified ?? 0,
      withRemote: withRemote ?? 0,
      withNpm: withNpm ?? 0,
      unlisted: unlisted ?? 0,
    };
  }

  return data;
}
