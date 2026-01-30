/**
 * Database Factory for Slack MCP
 *
 * Simplified version of Mesh's database factory for Slack MCP needs.
 * Supports both SQLite (development) and PostgreSQL (production K8s).
 */

import { existsSync, mkdirSync } from "fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { BunWorkerDialect } from "kysely-bun-worker";
import { Pool } from "pg";

// ============================================================================
// Database Schema Type
// ============================================================================

export interface SlackConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null;
  model_provider_id: string | null;
  model_id: string | null;
  agent_id: string | null;
  system_prompt: string | null;
  bot_token: string;
  signing_secret: string;
  team_id: string | null;
  bot_user_id: string | null;
  configured_at: string;
  updated_at: string;
}

export interface Database {
  slack_connections: SlackConnectionRow;
}

// ============================================================================
// Database Types
// ============================================================================

export type DatabaseType = "sqlite" | "postgres";

export interface SqliteDatabase {
  type: "sqlite";
  db: Kysely<Database>;
}

export interface PostgresDatabase {
  type: "postgres";
  db: Kysely<Database>;
  pool: Pool;
}

export type SlackDatabase = SqliteDatabase | PostgresDatabase;

// ============================================================================
// Database Config
// ============================================================================

interface DatabaseConfig {
  type: DatabaseType;
  connectionString: string;
}

function parseDatabaseUrl(databaseUrl?: string): DatabaseConfig {
  let url = databaseUrl || "file:./data/slack.db";

  // Handle :memory:
  if (url === ":memory:") {
    return { type: "sqlite", connectionString: ":memory:" };
  }

  // Add file:// for absolute paths
  url = url.startsWith("/") ? `file://${url}` : url;

  const parsed = URL.canParse(url) ? new URL(url) : null;
  const protocol = parsed?.protocol.replace(":", "") ?? url.split("://")[0];

  switch (protocol) {
    case "postgres":
    case "postgresql":
      return { type: "postgres", connectionString: url };

    case "sqlite":
    case "file":
      if (!parsed?.pathname) {
        throw new Error("Invalid database URL: " + url);
      }
      return { type: "sqlite", connectionString: parsed.pathname };

    default:
      throw new Error(
        `Unsupported database protocol: ${protocol}. ` +
          `Supported: postgres://, postgresql://, sqlite://, file://`,
      );
  }
}

// ============================================================================
// SQLite Implementation
// ============================================================================

function extractSqlitePath(connectionString: string): string {
  if (connectionString === ":memory:") {
    return ":memory:";
  }

  if (connectionString.includes("://")) {
    const url = new URL(connectionString);
    return url.pathname;
  }

  return connectionString;
}

function ensureSqliteDirectory(dbPath: string): string {
  if (dbPath !== ":memory:" && dbPath !== "/" && dbPath) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir && dir !== "/" && !existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        console.warn(
          `Failed to create directory ${dir}, using in-memory database`,
        );
        return ":memory:";
      }
    }
  }
  return dbPath;
}

function createSqliteDatabase(config: DatabaseConfig): SqliteDatabase {
  let dbPath = extractSqlitePath(config.connectionString);
  dbPath = ensureSqliteDirectory(dbPath);

  const dialect = new BunWorkerDialect({
    url: dbPath || ":memory:",
  });

  const db = new Kysely<Database>({ dialect });

  // Enable foreign keys and WAL mode
  sql`PRAGMA foreign_keys = ON;`.execute(db).catch(() => {});
  if (dbPath !== ":memory:") {
    sql`PRAGMA journal_mode = WAL;`.execute(db).catch(() => {});
    sql`PRAGMA busy_timeout = 5000;`.execute(db).catch(() => {});
  }

  return { type: "sqlite", db };
}

// ============================================================================
// PostgreSQL Implementation
// ============================================================================

function createPostgresDatabase(config: DatabaseConfig): PostgresDatabase {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 10,
    ssl: process.env.DATABASE_PG_SSL === "true" ? true : false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    idleTimeoutMillis: 300000,
    connectionTimeoutMillis: 30000,
    allowExitOnIdle: true,
  });

  const dialect = new PostgresDialect({ pool });
  const db = new Kysely<Database>({ dialect });

  return { type: "postgres", db, pool };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create database instance
 */
export function createDatabase(databaseUrl?: string): SlackDatabase {
  const config = parseDatabaseUrl(databaseUrl);

  if (config.type === "postgres") {
    return createPostgresDatabase(config);
  }

  return createSqliteDatabase(config);
}

/**
 * Close database connection
 */
export async function closeDatabase(database: SlackDatabase): Promise<void> {
  await database.db.destroy();

  if (database.type === "postgres" && !database.pool.ended) {
    await database.pool.end();
  }
}

/**
 * Singleton database instance
 */
let dbInstance: SlackDatabase | null = null;

export function getDb(databaseUrl?: string): SlackDatabase {
  if (!dbInstance) {
    dbInstance = createDatabase(databaseUrl);
  }
  return dbInstance;
}

/**
 * Reset database instance (for testing)
 */
export function resetDb(): void {
  if (dbInstance) {
    closeDatabase(dbInstance);
    dbInstance = null;
  }
}
