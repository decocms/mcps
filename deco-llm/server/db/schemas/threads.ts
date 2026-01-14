import type { Env } from "../../main.ts";
import { runSQL } from "../postgres.ts";

/**
 * Ensure the threads and messages tables exist, creating them if necessary
 */
export async function ensureThreadsTables(env: Env) {
  try {
    // Create threads table
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        title TEXT,
        status TEXT DEFAULT 'active'
      )
    `,
    );

    // Create messages table
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        tool_calls TEXT,
        tokens_used INTEGER DEFAULT 0,
        model TEXT,
        finish_reason TEXT,
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
      )
    `,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_created_at ON messages(thread_id, created_at)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC)`,
    );
  } catch (error) {
    console.error("Error ensuring threads tables exist:", error);
    throw error;
  }
}
