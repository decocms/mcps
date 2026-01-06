/**
 * Type definitions for Supabase database operations
 */

import { z } from "zod";

/**
 * Filter operators supported by Supabase
 */
export const FilterOperator = z.enum([
  "eq", // equal
  "neq", // not equal
  "gt", // greater than
  "gte", // greater than or equal
  "lt", // less than
  "lte", // less than or equal
  "like", // pattern match (case sensitive)
  "ilike", // pattern match (case insensitive)
  "in", // in array
  "is", // is null/true/false
]);

export type FilterOperator = z.infer<typeof FilterOperator>;

/**
 * Filter definition for querying data
 */
export const FilterSchema = z.object({
  column: z.string().describe("The column to filter on"),
  operator: FilterOperator.describe("The comparison operator"),
  value: z.any().describe("The value to compare against"),
});

export type Filter = z.infer<typeof FilterSchema>;

/**
 * Order by definition
 */
export const OrderBySchema = z.object({
  column: z.string().describe("The column to order by"),
  ascending: z
    .boolean()
    .optional()
    .default(true)
    .describe("Sort ascending (default) or descending"),
  nullsFirst: z
    .boolean()
    .optional()
    .describe("Whether nulls should appear first"),
});

export type OrderBy = z.infer<typeof OrderBySchema>;

/**
 * Standard response format for all database operations
 */
export interface DbResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

/**
 * Supabase query builder interface for filter operations
 */
interface SupabaseFilterBuilder {
  eq: (column: string, value: unknown) => SupabaseFilterBuilder;
  neq: (column: string, value: unknown) => SupabaseFilterBuilder;
  gt: (column: string, value: unknown) => SupabaseFilterBuilder;
  gte: (column: string, value: unknown) => SupabaseFilterBuilder;
  lt: (column: string, value: unknown) => SupabaseFilterBuilder;
  lte: (column: string, value: unknown) => SupabaseFilterBuilder;
  like: (column: string, value: string) => SupabaseFilterBuilder;
  ilike: (column: string, value: string) => SupabaseFilterBuilder;
  in: (column: string, value: unknown[]) => SupabaseFilterBuilder;
  is: (column: string, value: null | boolean) => SupabaseFilterBuilder;
}

/**
 * Apply filters to a Supabase query builder
 */
export function applyFilters<T extends SupabaseFilterBuilder>(
  query: T,
  filters: Filter[],
): T {
  let result: SupabaseFilterBuilder = query;

  for (const filter of filters) {
    const { column, operator, value } = filter;

    switch (operator) {
      case "eq":
        result = result.eq(column, value);
        break;
      case "neq":
        result = result.neq(column, value);
        break;
      case "gt":
        result = result.gt(column, value);
        break;
      case "gte":
        result = result.gte(column, value);
        break;
      case "lt":
        result = result.lt(column, value);
        break;
      case "lte":
        result = result.lte(column, value);
        break;
      case "like":
        result = result.like(column, value as string);
        break;
      case "ilike":
        result = result.ilike(column, value as string);
        break;
      case "in":
        result = result.in(column, value as unknown[]);
        break;
      case "is":
        result = result.is(column, value as null | boolean);
        break;
    }
  }

  return result as T;
}
