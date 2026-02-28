import { FileMigrationProvider, Migrator } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDb } from "./index.ts";

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.INTERNAL_DATABASE_URL;
  const db = await getDb(databaseUrl);

  const migrator = new Migrator({
    db: db.db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dir, "../migrations"),
    }),
  });

  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }
}
