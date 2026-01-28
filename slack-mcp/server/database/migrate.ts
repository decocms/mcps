/**
 * Database Migration Runner
 *
 * Runs all pending migrations on startup.
 */

import { Migrator, FileMigrationProvider } from "kysely";
import { getDb } from "./index.ts";
import * as path from "path";
import { promises as fs } from "fs";

/**
 * Run all pending migrations
 */
export async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn(
      "[Migrate] ⚠️ DATABASE_URL not set, skipping migrations (using in-memory DB)",
    );
    return;
  }

  console.log("[Migrate] 🔄 Running database migrations...");

  const db = getDb(databaseUrl);

  const migrator = new Migrator({
    db: db.db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This is relative to the compiled output directory (dist/server)
      // When running with bun --hot, it's relative to the server directory
      migrationFolder: path.join(import.meta.dir, "../../migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(
        `[Migrate] ✅ Migration "${it.migrationName}" was executed successfully`,
      );
    } else if (it.status === "Error") {
      console.error(
        `[Migrate] ❌ Failed to execute migration "${it.migrationName}"`,
      );
    }
  });

  if (error) {
    console.error("[Migrate] ❌ Failed to run migrations:", error);
    throw error;
  }

  console.log("[Migrate] ✅ All migrations completed successfully");
}
