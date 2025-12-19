/**
 * PostgreSQL Database Module
 *
 * This module provides PostgreSQL connectivity using the DATABASE binding
 * and handles automatic table creation for MCP apps indexing.
 */

import type { Env } from "../main.ts";

/**
 * Check if DATABASE binding is available
 */
export function isDatabaseAvailable(env: Env): boolean {
  return !!(
    env.DATABASE && typeof env.DATABASE.DATABASES_RUN_SQL === "function"
  );
}

/**
 * Run a SQL query using the DATABASE binding
 * @param env - The environment containing the DATABASE binding
 * @param sql - SQL query with $1, $2, etc placeholders
 * @param params - Parameters to substitute for placeholders
 * @returns The query results as an array of rows
 * @throws Error if DATABASE binding is not available
 */
export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!isDatabaseAvailable(env)) {
    throw new Error(
      "DATABASE binding not available. Please configure the @deco/postgres binding.",
    );
  }
  const response = await env.DATABASE.DATABASES_RUN_SQL({
    sql,
    params,
  });
  return (response.result[0]?.results ?? []) as T[];
}

/**
 * Ensure all required tables exist, creating them if necessary
 */
export async function ensureTables(env: Env) {
  try {
    // Main apps table
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS mcp_apps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        title TEXT,
        description TEXT,
        schema_url TEXT,
        repository_url TEXT,
        website_url TEXT,
        packages JSONB DEFAULT '[]',
        remotes JSONB DEFAULT '[]',
        icons JSONB DEFAULT '[]',
        server_data JSONB NOT NULL,
        meta_data JSONB NOT NULL,
        has_remotes BOOLEAN DEFAULT false,
        has_packages BOOLEAN DEFAULT false,
        has_icons BOOLEAN DEFAULT false,
        has_repository BOOLEAN DEFAULT false,
        has_website BOOLEAN DEFAULT false,
        is_latest BOOLEAN DEFAULT false,
        is_official BOOLEAN DEFAULT true,
        published_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    );

    // Tags table (prepared for future use)
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS mcp_app_tags (
        id SERIAL PRIMARY KEY,
        app_id TEXT REFERENCES mcp_apps(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        UNIQUE(app_id, tag)
      )
    `,
    );

    // Categories table (fixed categories)
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS mcp_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT
      )
    `,
    );

    // App-Category relationship table
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS mcp_app_categories (
        app_id TEXT REFERENCES mcp_apps(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES mcp_categories(id),
        PRIMARY KEY (app_id, category_id)
      )
    `,
    );

    // Insert fixed categories (ignore if already exist)
    await runSQL(
      env,
      `
      INSERT INTO mcp_categories (id, name, description, icon)
      VALUES 
        ('ai', 'AI & Machine Learning', 'Ferramentas de IA e ML', 'brain'),
        ('data', 'Data & Analytics', 'Dados e análises', 'database'),
        ('integration', 'Integrations', 'Integrações e APIs', 'plug'),
        ('development', 'Development', 'Ferramentas de dev', 'code'),
        ('media', 'Media & Content', 'Mídia e conteúdo', 'image'),
        ('productivity', 'Productivity', 'Produtividade', 'check'),
        ('security', 'Security', 'Segurança e auth', 'shield'),
        ('other', 'Other', 'Outros', 'box')
      ON CONFLICT (id) DO NOTHING
    `,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_apps_name ON mcp_apps(name)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_apps_is_latest ON mcp_apps(is_latest)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_apps_has_remotes ON mcp_apps(has_remotes)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_apps_synced_at ON mcp_apps(synced_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_app_tags_app_id ON mcp_app_tags(app_id)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_mcp_app_tags_tag ON mcp_app_tags(tag)`,
    );
  } catch (error) {
    console.error("Error ensuring tables exist:", error);
    throw error;
  }
}

/**
 * MCP App record type matching the database schema
 */
export interface McpAppRecord {
  id: string;
  name: string;
  version: string;
  title: string | null;
  description: string | null;
  schema_url: string | null;
  repository_url: string | null;
  website_url: string | null;
  packages: unknown[];
  remotes: unknown[];
  icons: unknown[];
  server_data: unknown;
  meta_data: unknown;
  has_remotes: boolean;
  has_packages: boolean;
  has_icons: boolean;
  has_repository: boolean;
  has_website: boolean;
  is_latest: boolean;
  is_official: boolean;
  published_at: string | null;
  updated_at: string | null;
  synced_at: string;
}

/**
 * Upsert a single MCP app into the database
 */
export async function upsertApp(env: Env, app: McpAppRecord): Promise<void> {
  await runSQL(
    env,
    `
    INSERT INTO mcp_apps (
      id, name, version, title, description, schema_url, repository_url,
      website_url, packages, remotes, icons, server_data, meta_data,
      has_remotes, has_packages, has_icons, has_repository, has_website,
      is_latest, is_official, published_at, updated_at, synced_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      version = EXCLUDED.version,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      schema_url = EXCLUDED.schema_url,
      repository_url = EXCLUDED.repository_url,
      website_url = EXCLUDED.website_url,
      packages = EXCLUDED.packages,
      remotes = EXCLUDED.remotes,
      icons = EXCLUDED.icons,
      server_data = EXCLUDED.server_data,
      meta_data = EXCLUDED.meta_data,
      has_remotes = EXCLUDED.has_remotes,
      has_packages = EXCLUDED.has_packages,
      has_icons = EXCLUDED.has_icons,
      has_repository = EXCLUDED.has_repository,
      has_website = EXCLUDED.has_website,
      is_latest = EXCLUDED.is_latest,
      is_official = EXCLUDED.is_official,
      published_at = EXCLUDED.published_at,
      updated_at = EXCLUDED.updated_at,
      synced_at = EXCLUDED.synced_at
  `,
    [
      app.id,
      app.name,
      app.version,
      app.title,
      app.description,
      app.schema_url,
      app.repository_url,
      app.website_url,
      JSON.stringify(app.packages),
      JSON.stringify(app.remotes),
      JSON.stringify(app.icons),
      JSON.stringify(app.server_data),
      JSON.stringify(app.meta_data),
      app.has_remotes,
      app.has_packages,
      app.has_icons,
      app.has_repository,
      app.has_website,
      app.is_latest,
      app.is_official,
      app.published_at,
      app.updated_at,
      app.synced_at,
    ],
  );
}

/**
 * Get apps from database with filtering and pagination
 */
export async function getApps(
  env: Env,
  options: {
    limit?: number;
    offset?: number;
    search?: string;
    hasRemotes?: boolean;
    hasPackages?: boolean;
    isLatest?: boolean;
    isOfficial?: boolean;
  } = {},
): Promise<{ apps: McpAppRecord[]; total: number }> {
  const {
    limit = 30,
    offset = 0,
    search,
    hasRemotes,
    hasPackages,
    isLatest,
    isOfficial,
  } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(
      `(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (hasRemotes !== undefined) {
    conditions.push(`has_remotes = $${paramIndex}`);
    params.push(hasRemotes);
    paramIndex++;
  }

  if (hasPackages !== undefined) {
    conditions.push(`has_packages = $${paramIndex}`);
    params.push(hasPackages);
    paramIndex++;
  }

  if (isLatest !== undefined) {
    conditions.push(`is_latest = $${paramIndex}`);
    params.push(isLatest);
    paramIndex++;
  }

  if (isOfficial !== undefined) {
    conditions.push(`is_official = $${paramIndex}`);
    params.push(isOfficial);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await runSQL<{ count: string }>(
    env,
    `SELECT COUNT(*) as count FROM mcp_apps ${whereClause}`,
    params,
  );
  const total = parseInt(countResult[0]?.count ?? "0", 10);

  // Get paginated results
  const apps = await runSQL<McpAppRecord>(
    env,
    `
    SELECT * FROM mcp_apps 
    ${whereClause}
    ORDER BY name ASC, version DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...params, limit, offset],
  );

  return { apps, total };
}

/**
 * Get a single app by ID
 */
export async function getAppById(
  env: Env,
  id: string,
): Promise<McpAppRecord | null> {
  const results = await runSQL<McpAppRecord>(
    env,
    `SELECT * FROM mcp_apps WHERE id = $1`,
    [id],
  );
  return results[0] ?? null;
}

/**
 * Get a single app by name (returns latest version)
 */
export async function getAppByName(
  env: Env,
  name: string,
): Promise<McpAppRecord | null> {
  const results = await runSQL<McpAppRecord>(
    env,
    `SELECT * FROM mcp_apps WHERE name = $1 AND is_latest = true LIMIT 1`,
    [name],
  );
  return results[0] ?? null;
}

/**
 * Get all versions of an app by name
 */
export async function getAppVersions(
  env: Env,
  name: string,
): Promise<McpAppRecord[]> {
  return runSQL<McpAppRecord>(
    env,
    `SELECT * FROM mcp_apps WHERE name = $1 ORDER BY version DESC`,
    [name],
  );
}

/**
 * Get sync statistics
 */
export async function getSyncStats(env: Env): Promise<{
  totalApps: number;
  withRemotes: number;
  withPackages: number;
  latestVersions: number;
  lastSyncAt: string | null;
}> {
  const stats = await runSQL<{
    total_apps: string;
    with_remotes: string;
    with_packages: string;
    latest_versions: string;
    last_sync_at: string | null;
  }>(
    env,
    `
    SELECT 
      COUNT(*) as total_apps,
      COUNT(*) FILTER (WHERE has_remotes = true) as with_remotes,
      COUNT(*) FILTER (WHERE has_packages = true) as with_packages,
      COUNT(*) FILTER (WHERE is_latest = true) as latest_versions,
      MAX(synced_at) as last_sync_at
    FROM mcp_apps
  `,
  );

  const row = stats[0];
  return {
    totalApps: parseInt(row?.total_apps ?? "0", 10),
    withRemotes: parseInt(row?.with_remotes ?? "0", 10),
    withPackages: parseInt(row?.with_packages ?? "0", 10),
    latestVersions: parseInt(row?.latest_versions ?? "0", 10),
    lastSyncAt: row?.last_sync_at ?? null,
  };
}
