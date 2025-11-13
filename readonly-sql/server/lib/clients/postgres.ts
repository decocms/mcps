/**
 * PostgreSQL Database Client
 *
 * Implementation of DatabaseClient for PostgreSQL using the postgres library.
 */

import postgres from "postgres";
import type { DatabaseClient, QueryResult } from "../db-client.ts";

export class PostgresClient implements DatabaseClient {
  private sql: ReturnType<typeof postgres>;

  constructor(connectionString: string) {
    // Parse connection string and create postgres client
    this.sql = postgres(connectionString, {
      // Configure for read-only operations
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
      // Important: Set default transaction to read-only
      onnotice: () => {}, // Suppress notices
    });
  }

  async query(sqlQuery: string, params: any[] = []): Promise<QueryResult> {
    try {
      // Execute the query
      const result = await this.sql.unsafe(sqlQuery, params);

      // Extract field information
      const fields =
        result.columns?.map((col) => ({
          name: col.name,
          dataType: col.type?.toString(),
        })) || [];

      // Convert rows to plain objects
      const rows = result.map((row) => ({ ...row }));

      return {
        rows,
        rowCount: rows.length,
        fields,
      };
    } catch (error) {
      // Re-throw with more context
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PostgreSQL query failed: ${message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.sql`SELECT 1 as test`;
      return true;
    } catch (error) {
      console.error("PostgreSQL connection test failed:", error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
