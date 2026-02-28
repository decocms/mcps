import { resolve4 } from "node:dns/promises";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema.ts";

export interface ReportsDatabase {
  db: Kysely<Database>;
  pool: Pool;
}

function assertDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error("INTERNAL_DATABASE_URL is required.");
  }

  return databaseUrl;
}

async function resolveToIPv4(connectionString: string): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;

    if (hostname && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const [ipv4] = await resolve4(hostname);
      url.hostname = ipv4;
      return url.toString();
    }
  } catch {
    // Fallback to original URL if resolution fails
  }

  return connectionString;
}

export async function createDatabase(
  databaseUrl: string,
): Promise<ReportsDatabase> {
  const resolvedUrl = await resolveToIPv4(databaseUrl);

  const pool = new Pool({
    connectionString: resolvedUrl,
    max: 10,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 300_000,
    connectionTimeoutMillis: 30_000,
    allowExitOnIdle: true,
    ssl: process.env.DATABASE_PG_SSL === "true",
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  return { db, pool };
}

let dbInstance: ReportsDatabase | null = null;

export async function getDb(
  databaseUrl: string | undefined,
): Promise<ReportsDatabase> {
  if (!dbInstance) {
    dbInstance = await createDatabase(assertDatabaseUrl(databaseUrl));
  }

  return dbInstance;
}

export async function closeDatabase(database: ReportsDatabase): Promise<void> {
  await database.db.destroy();

  if (!database.pool.ended) {
    await database.pool.end();
  }
}

export async function resetDb(): Promise<void> {
  if (dbInstance) {
    await closeDatabase(dbInstance);
    dbInstance = null;
  }
}
