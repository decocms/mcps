/**
 * Database Client
 *
 * SQLite client for querying content scrape tables using libSQL/Turso.
 */

import { createClient, type Client } from "@libsql/client";

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface DatabaseClient {
  query(sqlQuery: string, params?: unknown[]): Promise<QueryResult>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}

export class SqliteClient implements DatabaseClient {
  private client: Client;

  constructor(url: string, authToken?: string) {
    this.client = createClient({
      url,
      authToken,
    });
  }

  async query(sqlQuery: string, params: unknown[] = []): Promise<QueryResult> {
    try {
      const result = await this.client.execute({
        sql: sqlQuery,
        args: params as any[],
      });

      const rows = result.rows.map((row) => ({ ...row }));

      return {
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SQLite query failed: ${message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.execute("SELECT 1 as test");
      return true;
    } catch (error) {
      console.error("SQLite connection test failed:", error);
      return false;
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

/**
 * Create a database client based on the connection string.
 */
export function createDatabaseClient(
  url: string,
  authToken?: string,
): DatabaseClient {
  return new SqliteClient(url, authToken);
}
