/**
 * PostgreSQL Database Module
 *
 * This module provides PostgreSQL connectivity using the DATABASE binding
 * and handles automatic table creation for the agents collection.
 */

import type { Env } from "../main.ts";

/**
 * Run a SQL query using the DATABASE binding
 * @param env - The environment containing the DATABASE binding
 * @param sql - SQL query with ? placeholders
 * @param params - Parameters to substitute for ? placeholders
 * @returns The query results as an array of rows
 */
export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const response = await env.DATABASE.DATABASES_RUN_SQL({ sql, params });
  return (response.result[0]?.results ?? []) as T[];
}

/**
 * Ensure the agents table exists, creating it if necessary
 */
export async function ensureAgentsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
			CREATE TABLE IF NOT EXISTS agents (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_by TEXT,
				updated_by TEXT,
				description TEXT NOT NULL,
				instructions TEXT NOT NULL,
				tool_set JSONB NOT NULL DEFAULT '{}'::jsonb,
				avatar TEXT NOT NULL DEFAULT ''
			)
		`,
    );

    // Add avatar column if it doesn't exist (migration for existing tables)
    await runSQL(
      env,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''`,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_title ON agents(title)`,
    );
  } catch (error) {
    console.error("Error ensuring agents table exists:", error);
    throw error;
  }
}
/**
 * PostgreSQL Table Management
 *
 * This module handles automatic table creation for the agents collection
 * using the @deco/postgres MCP binding.
 */

import { CollectionListInputSchema } from "@decocms/bindings/collections";
import { collectionsQueries } from "../collections/index.ts";
import z from "zod";

/**
 * Ensure the agents table exists, creating it if necessary
 */
export async function ensureTable(
  env: Env,
  tableName: keyof typeof collectionsQueries,
) {
  try {
    try {
      await env.DATABASE.DATABASES_RUN_SQL({
        sql: collectionsQueries[tableName].idempotent,
      });
    } catch (error) {
      console.error(`Error running idempotent SQL for ${tableName}:`, error);
      throw error;
    }

    await env.DATABASE.DATABASES_RUN_SQL({
      sql: collectionsQueries[tableName].indexes,
    });
  } catch (error) {
    console.error(`Error ensuring ${tableName} table exists:`, error);
    throw error;
  }
}

export async function ensureCollectionsTables(env: Env) {
  for (const tableName of Object.keys(collectionsQueries)) {
    try {
      await ensureTable(
        env,
        tableName as keyof typeof collectionsQueries as keyof typeof collectionsQueries,
      );
    } catch (error) {
      console.error(`Error ensuring ${tableName} table exists:`, error);
      throw error;
    }
  }
}

/**
 * Build SQL WHERE clause from filter expression
 */
export function buildWhereClause(
  whereExpr: WhereExpression,
  params: any[] = [],
): { clause: string; params: any[] } {
  if (!whereExpr) {
    return { clause: "", params };
  }

  // Simple condition
  if (
    "field" in whereExpr &&
    "operator" in whereExpr &&
    !("conditions" in whereExpr)
  ) {
    const simpleExpr = whereExpr as any;
    const fieldPath = simpleExpr.field;
    const fieldName = fieldPath[fieldPath.length - 1];
    const paramIndex = params.length + 1;

    switch (simpleExpr.operator) {
      case "eq":
        params.push(simpleExpr.value);
        return { clause: `${fieldName} = $${paramIndex}`, params };
      case "gt":
        params.push(simpleExpr.value);
        return { clause: `${fieldName} > $${paramIndex}`, params };
      case "gte":
        params.push(simpleExpr.value);
        return { clause: `${fieldName} >= $${paramIndex}`, params };
      case "lt":
        params.push(simpleExpr.value);
        return { clause: `${fieldName} < $${paramIndex}`, params };
      case "lte":
        params.push(simpleExpr.value);
        return { clause: `${fieldName} <= $${paramIndex}`, params };
      case "in":
        const values = Array.isArray(simpleExpr.value)
          ? simpleExpr.value
          : [simpleExpr.value];
        params.push(values);
        return { clause: `${fieldName} = ANY($${paramIndex})`, params };
      case "like":
      case "contains":
        params.push(`%${simpleExpr.value}%`);
        return { clause: `${fieldName} ILIKE $${paramIndex}`, params };
      default:
        throw new Error(`Unsupported operator: ${simpleExpr.operator}`);
    }
  }

  // Logical condition (and, or, not)
  if ("operator" in whereExpr && "conditions" in whereExpr) {
    const logicalExpr = whereExpr as any;
    const conditions = logicalExpr.conditions.map((cond: any) => {
      const result = buildWhereClause(cond, params);
      params = result.params;
      return result.clause;
    });

    switch (logicalExpr.operator) {
      case "and":
        return { clause: `(${conditions.join(" AND ")})`, params };
      case "or":
        return { clause: `(${conditions.join(" OR ")})`, params };
      case "not":
        return { clause: `NOT (${conditions[0]})`, params };
      default:
        throw new Error(
          `Unsupported logical operator: ${logicalExpr.operator}`,
        );
    }
  }

  return { clause: "", params };
}

type WhereExpression = z.infer<typeof CollectionListInputSchema>["where"];
type OrderByExpression = z.infer<typeof CollectionListInputSchema>["orderBy"];

/**
 * Build SQL ORDER BY clause from sort expression
 */
export function buildOrderByClause(orderByExpr: OrderByExpression): string {
  if (!orderByExpr || orderByExpr.length === 0) {
    return "ORDER BY created_at DESC";
  }

  const orderClauses = orderByExpr.map((order) => {
    const fieldPath = order.field;
    const fieldName = fieldPath[fieldPath.length - 1];
    const direction = order.direction.toUpperCase();
    const nulls = order.nulls ? ` NULLS ${order.nulls.toUpperCase()}` : "";
    return `${fieldName} ${direction}${nulls}`;
  });

  return `ORDER BY ${orderClauses.join(", ")}`;
}
