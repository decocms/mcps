/**
 * Database Client Interface
 *
 * Provides an abstraction layer for different database types.
 * Currently supports PostgreSQL with extensibility for MySQL, SQLite, etc.
 */

export interface QueryResult {
  rows: Record<string, any>[];
  rowCount: number;
  fields: Array<{
    name: string;
    dataType?: string;
  }>;
}

export interface DatabaseClient {
  /**
   * Execute a read-only SQL query
   */
  query(sql: string, params?: any[]): Promise<QueryResult>;

  /**
   * Test the database connection
   */
  testConnection(): Promise<boolean>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;
}

export type DatabaseType = "postgres" | "mysql" | "sqlite";

/**
 * Factory function to create a database client based on type
 */
export async function createDatabaseClient(
  type: DatabaseType,
  connectionString: string,
): Promise<DatabaseClient> {
  switch (type) {
    case "postgres":
      const { PostgresClient } = await import("./clients/postgres.ts");
      return new PostgresClient(connectionString);

    case "mysql":
      throw new Error("MySQL support is not yet implemented");

    case "sqlite":
      throw new Error("SQLite support is not yet implemented");

    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
