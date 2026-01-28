/**
 * Reset Database
 *
 * Drops all tables and re-runs migrations.
 * Usage: bun run scripts/reset-db.ts
 */

import { getDb } from "../server/database/index.ts";
import { migrate } from "../server/database/migrate.ts";
import { sql } from "kysely";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set!");
  process.exit(1);
}

console.log("[Reset] 🔄 Resetting database...");
console.log("[Reset] 📍 URL:", databaseUrl.replace(/:[^:@]+@/, ":****@"));

const db = getDb(databaseUrl);

try {
  // Drop all tables
  console.log("[Reset] 🗑️  Dropping tables...");

  await sql`DROP TABLE IF EXISTS slack_connections CASCADE`.execute(db.db);
  await sql`DROP TABLE IF EXISTS kysely_migration CASCADE`.execute(db.db);
  await sql`DROP TABLE IF EXISTS kysely_migration_lock CASCADE`.execute(db.db);

  console.log("[Reset] ✅ Tables dropped");

  // Re-run migrations
  console.log("[Reset] 🔄 Running migrations...");
  await migrate();

  console.log("[Reset] ✅ Database reset complete!");
} catch (error) {
  console.error("[Reset] ❌ Failed:", error);
  process.exit(1);
} finally {
  await db.db.destroy();
  if (db.type === "postgres" && !db.pool.ended) {
    await db.pool.end();
  }
  process.exit(0);
}
