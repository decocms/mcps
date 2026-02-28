import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolConfig } from "pg";
import type { Database } from "./schema.ts";

interface PoolConfigWithFamily extends PoolConfig {
  family?: number;
}

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

export function createDatabase(databaseUrl: string): ReportsDatabase {
  const poolConfig: PoolConfigWithFamily = {
    connectionString: databaseUrl,
    max: 10,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 300_000,
    connectionTimeoutMillis: 30_000,
    allowExitOnIdle: true,
    ssl: process.env.DATABASE_PG_SSL === "true",
    family: 4,
  };

  const pool = new Pool(poolConfig);

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  return { db, pool };
}

let dbInstance: ReportsDatabase | null = null;

export function getDb(databaseUrl: string | undefined): ReportsDatabase {
  if (!dbInstance) {
    dbInstance = createDatabase(assertDatabaseUrl(databaseUrl));
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
