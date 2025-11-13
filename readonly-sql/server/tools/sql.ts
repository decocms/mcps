/**
 * SQL Query Tools
 *
 * Tools for executing read-only SQL queries against configured databases.
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createDatabaseClient, type DatabaseClient } from "../lib/db-client.ts";
import { validateReadOnlyQuery } from "../lib/sql-validator.ts";

/**
 * QUERY_SQL - Execute a read-only SQL query
 */
export const createQuerySqlTool = (env: Env) =>
  createPrivateTool({
    id: "QUERY_SQL",
    description:
      "Execute a read-only SQL query against the configured database. Only SELECT and other read operations are allowed. Supports standard SQL syntax including JOINs, WHERE clauses, aggregations, and CTEs.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The SQL query to execute. Must be a read-only query (SELECT, SHOW, DESCRIBE, EXPLAIN, etc.). Write operations (INSERT, UPDATE, DELETE, etc.) are not allowed.",
        ),
      params: z
        .array(z.any())
        .optional()
        .describe(
          "Optional array of parameters for parameterized queries. Use $1, $2, etc. in PostgreSQL for placeholders.",
        ),
      limit: z
        .number()
        .optional()
        .default(1000)
        .describe(
          "Maximum number of rows to return (default: 1000). Use this to prevent accidentally returning too much data.",
        ),
    }),
    outputSchema: z.object({
      rows: z
        .array(z.record(z.any()))
        .describe(
          "Array of result rows, each row is an object with column names as keys",
        ),
      rowCount: z.number().describe("Total number of rows returned"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Column name"),
            dataType: z.string().optional().describe("Data type of the column"),
          }),
        )
        .describe("Metadata about the columns in the result set"),
      truncated: z
        .boolean()
        .describe("Whether the results were truncated due to the limit"),
    }),
    execute: async (ctx: any) => {
      const { query, params = [], limit } = ctx;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      // Validate the query is read-only
      const validation = validateReadOnlyQuery(query);
      if (!validation.isValid) {
        throw new Error(
          `Query validation failed:\n${validation.errors.join("\n")}`,
        );
      }

      // Create database client
      let client: DatabaseClient | undefined = undefined;
      try {
        client = await createDatabaseClient(
          state.databaseType,
          state.connectionString,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to connect to database: ${message}`);
      }

      try {
        // Test connection first
        const isConnected = await client.testConnection();
        if (!isConnected) {
          throw new Error("Failed to establish database connection");
        }

        // Execute the query
        const result = await client.query(query, params);

        // Apply limit if needed
        const truncated = result.rowCount > limit;
        const rows = truncated ? result.rows.slice(0, limit) : result.rows;

        return {
          rows,
          rowCount: rows.length,
          fields: result.fields,
          truncated,
        };
      } finally {
        // Always close the connection
        if (client) await client.close();
      }
    },
  });

// Export all SQL-related tools
export const sqlTools = [createQuerySqlTool];
