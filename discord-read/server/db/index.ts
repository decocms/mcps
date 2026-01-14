/**
 * Database Module
 *
 * Handles table creation and provides database utilities for Discord MCP.
 */

import type { Env } from "../types/env.ts";
import { runSQL } from "./postgres.ts";
import { discordQueries } from "./schemas/discord.ts";
import {
  guildsTableIdempotentQuery,
  guildsTableIndexesQuery,
} from "../../shared/db.ts";

/**
 * Collection queries for database table creation.
 * Order matters for foreign key constraints!
 */
const collectionsQueries = {
  // Guilds first (referenced by messages)
  guilds: {
    idempotent: guildsTableIdempotentQuery,
    indexes: guildsTableIndexesQuery,
  },
  messages: {
    idempotent: discordQueries.messages.idempotent,
    indexes: discordQueries.messages.indexes,
  },
  reactions: {
    idempotent: discordQueries.reactions.idempotent,
    indexes: discordQueries.reactions.indexes,
  },
};

/**
 * Ensure all Discord MCP tables exist in the database.
 * Called on configuration change.
 */
export async function ensureCollections(env: Env): Promise<void> {
  for (const [name, collection] of Object.entries(collectionsQueries)) {
    try {
      await runSQL(env, collection.idempotent);
      console.log(`[DB] Table ${name} ensured`);
    } catch (error) {
      console.error(`[DB] Error ensuring table ${name}:`, error);
      throw error;
    }
  }

  // Run migrations after tables are created
  try {
    if (discordQueries.messages.migration) {
      await runSQL(env, discordQueries.messages.migration);
      console.log(`[DB] Migrations applied`);
    }
  } catch (error) {
    console.error(`[DB] Error running migrations:`, error);
    // Don't throw - migrations might fail if already applied
  }

  // Run migration indexes after migrations
  try {
    if (discordQueries.messages.migrationIndexes) {
      const indexStatements = discordQueries.messages.migrationIndexes
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of indexStatements) {
        await runSQL(env, statement);
      }
      console.log(`[DB] Migration indexes applied`);
    }
  } catch (error) {
    console.error(`[DB] Error running migration indexes:`, error);
    // Don't throw - indexes are not critical
  }
}

/**
 * Ensure all indexes exist for Discord MCP tables.
 * Called after table creation.
 */
export async function ensureIndexes(env: Env): Promise<void> {
  for (const [name, collection] of Object.entries(collectionsQueries)) {
    try {
      // Split indexes by semicolon and run each separately
      const indexStatements = collection.indexes
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of indexStatements) {
        await runSQL(env, statement);
      }
      console.log(`[DB] Indexes for ${name} ensured`);
    } catch (error) {
      console.error(`[DB] Error ensuring indexes for ${name}:`, error);
      // Don't throw - indexes are not critical for operation
    }
  }
}

export { collectionsQueries, discordQueries };
export { runSQL } from "./postgres.ts";
