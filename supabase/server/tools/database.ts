/**
 * Supabase Database Tools
 *
 * Tools for executing database operations against Supabase.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createClient } from "../lib/client.ts";
import {
  FilterSchema,
  OrderBySchema,
  applyFilters,
  type DbResponse,
} from "../lib/types.ts";

// ============================================================================
// DB_SELECT - Query records from a table
// ============================================================================

export const createDbSelectTool = (env: Env) =>
  createPrivateTool({
    id: "db_select",
    description:
      "Query records from a Supabase table. Supports filtering, ordering, pagination, and column selection.",
    inputSchema: z.object({
      table: z.string().describe("The table name to query"),
      columns: z
        .array(z.string())
        .optional()
        .describe(
          "Columns to select. If not provided, all columns (*) are returned.",
        ),
      filters: z
        .array(FilterSchema)
        .optional()
        .describe("Array of filter conditions to apply"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of records to return"),
      offset: z.number().optional().describe("Number of records to skip"),
      orderBy: z
        .array(OrderBySchema)
        .optional()
        .describe("Array of columns to order by"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.record(z.string(), z.any())).optional(),
      error: z.string().optional(),
      count: z.number().optional(),
    }),
    execute: async ({
      context,
    }): Promise<DbResponse<Record<string, unknown>[]>> => {
      const { table, columns, filters, limit, offset, orderBy } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        const selectColumns = columns?.join(", ") || "*";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = client
          .from(table)
          .select(selectColumns, { count: "exact" }) as any;

        // Apply filters
        if (filters && filters.length > 0) {
          query = applyFilters(query, filters);
        }

        // Apply ordering
        if (orderBy && orderBy.length > 0) {
          for (const order of orderBy) {
            query = query.order(order.column, {
              ascending: order.ascending ?? true,
              nullsFirst: order.nullsFirst,
            });
          }
        }

        // Apply pagination
        if (limit !== undefined) {
          query = query.limit(limit);
        }
        if (offset !== undefined) {
          query = query.range(offset, offset + (limit ?? 1000) - 1);
        }

        const { data, error, count } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data ?? [],
          count: count ?? data?.length ?? 0,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// DB_INSERT - Insert records into a table
// ============================================================================

export const createDbInsertTool = (env: Env) =>
  createPrivateTool({
    id: "db_insert",
    description:
      "Insert one or more records into a Supabase table. Can optionally return the inserted data.",
    inputSchema: z.object({
      table: z.string().describe("The table name to insert into"),
      data: z
        .union([
          z.record(z.string(), z.any()),
          z.array(z.record(z.string(), z.any())),
        ])
        .describe(
          "Record(s) to insert. Can be a single object or array of objects.",
        ),
      returning: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to return the inserted record(s)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.record(z.string(), z.any())).optional(),
      error: z.string().optional(),
      count: z.number().optional(),
    }),
    execute: async ({
      context,
    }): Promise<DbResponse<Record<string, unknown>[]>> => {
      const { table, data, returning } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        const query = returning
          ? client.from(table).insert(data).select()
          : client.from(table).insert(data);

        const { data: result, error } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        const resultArray = Array.isArray(result)
          ? result
          : result
            ? [result]
            : [];

        return {
          success: true,
          data: returning ? resultArray : undefined,
          count: Array.isArray(data) ? data.length : 1,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// DB_UPDATE - Update records in a table
// ============================================================================

export const createDbUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "db_update",
    description:
      "Update records in a Supabase table that match the specified filters. Requires at least one filter to prevent accidental mass updates.",
    inputSchema: z.object({
      table: z.string().describe("The table name to update"),
      data: z
        .record(z.string(), z.any())
        .describe("Object containing the columns and values to update"),
      filters: z
        .array(FilterSchema)
        .min(1)
        .describe(
          "Array of filter conditions to identify records to update (required)",
        ),
      returning: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to return the updated record(s)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.record(z.string(), z.any())).optional(),
      error: z.string().optional(),
      count: z.number().optional(),
    }),
    execute: async ({
      context,
    }): Promise<DbResponse<Record<string, unknown>[]>> => {
      const { table, data, filters, returning } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = client.from(table).update(data) as any;

        // Apply filters (required for update)
        query = applyFilters(query, filters);

        if (returning) {
          query = query.select();
        }

        const { data: result, error } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        const resultArray = Array.isArray(result)
          ? result
          : result
            ? [result]
            : [];

        return {
          success: true,
          data: returning ? resultArray : undefined,
          count: resultArray.length,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// DB_DELETE - Delete records from a table
// ============================================================================

export const createDbDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "db_delete",
    description:
      "Delete records from a Supabase table that match the specified filters. Requires at least one filter to prevent accidental mass deletion.",
    inputSchema: z.object({
      table: z.string().describe("The table name to delete from"),
      filters: z
        .array(FilterSchema)
        .min(1)
        .describe(
          "Array of filter conditions to identify records to delete (required)",
        ),
      returning: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to return the deleted record(s)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.record(z.string(), z.any())).optional(),
      error: z.string().optional(),
      count: z.number().optional(),
    }),
    execute: async ({
      context,
    }): Promise<DbResponse<Record<string, unknown>[]>> => {
      const { table, filters, returning } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = client.from(table).delete() as any;

        // Apply filters (required for delete)
        query = applyFilters(query, filters);

        if (returning) {
          query = query.select();
        }

        const { data: result, error } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        const resultArray = Array.isArray(result)
          ? result
          : result
            ? [result]
            : [];

        return {
          success: true,
          data: returning ? resultArray : undefined,
          count: resultArray.length,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// DB_UPSERT - Insert or update records
// ============================================================================

export const createDbUpsertTool = (env: Env) =>
  createPrivateTool({
    id: "db_upsert",
    description:
      "Insert a record or update it if it already exists (based on unique constraint). Useful for syncing data.",
    inputSchema: z.object({
      table: z.string().describe("The table name to upsert into"),
      data: z
        .union([
          z.record(z.string(), z.any()),
          z.array(z.record(z.string(), z.any())),
        ])
        .describe(
          "Record(s) to upsert. Can be a single object or array of objects.",
        ),
      onConflict: z
        .string()
        .describe(
          "Column(s) to use for conflict detection. Usually the primary key or unique constraint columns.",
        ),
      returning: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to return the upserted record(s)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.record(z.string(), z.any())).optional(),
      error: z.string().optional(),
      count: z.number().optional(),
    }),
    execute: async ({
      context,
    }): Promise<DbResponse<Record<string, unknown>[]>> => {
      const { table, data, onConflict, returning } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        const query = returning
          ? client.from(table).upsert(data, { onConflict }).select()
          : client.from(table).upsert(data, { onConflict });

        const { data: result, error } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        const resultArray = Array.isArray(result)
          ? result
          : result
            ? [result]
            : [];

        return {
          success: true,
          data: returning ? resultArray : undefined,
          count: Array.isArray(data) ? data.length : 1,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// DB_RPC - Call a stored procedure/function
// ============================================================================

export const createDbRpcTool = (env: Env) =>
  createPrivateTool({
    id: "db_rpc",
    description:
      "Call a PostgreSQL function (RPC) in Supabase. Useful for complex operations, aggregations, or custom business logic.",
    inputSchema: z.object({
      functionName: z
        .string()
        .describe("The name of the PostgreSQL function to call"),
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe("Parameters to pass to the function as an object"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }): Promise<DbResponse> => {
      const { functionName, params } = context;
      const state = env.MESH_REQUEST_CONTEXT?.state;

      try {
        const client = createClient({
          supabaseUrl: state.supabaseUrl,
          supabaseKey: state.supabaseKey,
        });

        const { data, error } = await client.rpc(functionName, params ?? {});

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
  });

// ============================================================================
// Export all database tools
// ============================================================================

export const databaseTools = [
  createDbSelectTool,
  createDbInsertTool,
  createDbUpdateTool,
  createDbDeleteTool,
  createDbUpsertTool,
  createDbRpcTool,
];
