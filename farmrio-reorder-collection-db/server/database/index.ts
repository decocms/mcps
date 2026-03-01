import { lookup } from "node:dns/promises";
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
  // Find the last @ which separates credentials from host in postgres URLs.
  // Using lastIndexOf handles passwords that contain @ characters.
  const lastAt = connectionString.lastIndexOf("@");
  if (lastAt === -1) return connectionString;

  const afterAt = connectionString.slice(lastAt + 1);

  // Extract hostname (stops at : for port, / for dbname, or ? for params)
  const hostMatch = afterAt.match(
    /^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?::\d+)?(?:\/|$|\?)/,
  );
  if (!hostMatch?.[1]) return connectionString;

  const hostname = hostMatch[1];

  // Already an IPv4 address, nothing to do
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return connectionString;
  }

  try {
    // Use lookup with family:4 instead of resolve4 — lookup goes through the
    // full OS resolver chain (getaddrinfo), which is more reliable in K8s
    // environments where resolve4 (direct DNS A-record queries) may fail.
    const { address } = await lookup(hostname, { family: 4 });
    return (
      connectionString.slice(0, lastAt + 1) + afterAt.replace(hostname, address)
    );
  } catch (err) {
    console.error(
      `[db] Failed to resolve "${hostname}" to IPv4, using original hostname. Error:`,
      err,
    );
    return connectionString;
  }
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
