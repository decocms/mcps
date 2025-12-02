/**
 * Generic Collection Tools Factory
 *
 * This module provides a factory function to create CRUD tools for any Drizzle table
 * that follows the BaseCollectionEntitySchema pattern. It automatically generates
 * the 5 standard collection operations: LIST, GET, INSERT, UPDATE, DELETE.
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  type BaseCollectionEntitySchemaType,
  CollectionListInputSchema,
  CollectionGetInputSchema,
  createCollectionListOutputSchema,
  createCollectionGetOutputSchema,
  createCollectionInsertInputSchema,
  createCollectionInsertOutputSchema,
  createCollectionUpdateInputSchema,
  createCollectionUpdateOutputSchema,
  CollectionDeleteInputSchema,
  CollectionDeleteOutputSchema,
} from "@decocms/bindings/collections";
import { z } from "zod";
import {
  eq,
  and,
  or,
  like,
  gt,
  gte,
  lt,
  lte,
  inArray,
  sql,
  asc,
  desc,
} from "drizzle-orm";
import type { Env } from "../main.ts";

type WhereExpression = z.infer<typeof CollectionListInputSchema>["where"];
type OrderByExpression = z.infer<typeof CollectionListInputSchema>["orderBy"];

/**
 * Creates CRUD tools for a collection based on a Drizzle table schema
 *
 * @param collectionName - The name of the collection (e.g., "agents")
 * @param entitySchema - The Zod schema for the entity
 * @param drizzleTable - The Drizzle table definition
 * @param getDb - Function to get database instance from env
 * @returns Array of tool factory functions
 */
export function createCollectionTools<
  TEntitySchema extends BaseCollectionEntitySchemaType,
  TTable extends Record<string, any>,
>(
  collectionName: string,
  entitySchema: TEntitySchema,
  drizzleTable: TTable,
  getDb: (env: Env) => Promise<any>,
) {
  const toolName = (operation: string) =>
    `COLLECTION_${collectionName.toUpperCase()}_${operation}`;

  // Helper to build where conditions from expression
  const buildWhereCondition = (
    whereExpr: WhereExpression,
    table: TTable,
  ): any => {
    if (!whereExpr) return undefined;

    // Simple condition
    if ("field" in whereExpr && "operator" in whereExpr) {
      const fieldPath = whereExpr.field;
      const fieldName = fieldPath[fieldPath.length - 1]; // Get last part of path
      const column = table[fieldName];

      if (!column) {
        throw new Error(`Field ${fieldName} not found in table`);
      }

      switch (whereExpr.operator) {
        case "eq":
          return eq(column, whereExpr.value);
        case "gt":
          return gt(column, whereExpr.value);
        case "gte":
          return gte(column, whereExpr.value);
        case "lt":
          return lt(column, whereExpr.value);
        case "lte":
          return lte(column, whereExpr.value);
        case "in":
          return inArray(
            column,
            Array.isArray(whereExpr.value)
              ? whereExpr.value
              : [whereExpr.value],
          );
        case "like":
        case "contains":
          return like(column, `%${whereExpr.value}%`);
        default:
          throw new Error(`Unsupported operator: ${whereExpr.operator}`);
      }
    }

    // Logical condition (and, or, not)
    if ("operator" in whereExpr && "conditions" in whereExpr) {
      const conditions = whereExpr.conditions.map((cond) =>
        buildWhereCondition(cond as any, table),
      );

      switch (whereExpr.operator) {
        case "and":
          return and(...conditions);
        case "or":
          return or(...conditions);
        case "not":
          // Drizzle doesn't have a direct 'not', so we use sql
          return sql`NOT (${conditions[0]})`;
        default:
          throw new Error(
            `Unsupported logical operator: ${whereExpr.operator}`,
          );
      }
    }

    return undefined;
  };

  // Helper to build order by clause
  const buildOrderBy = (
    orderByExpr: OrderByExpression,
    table: TTable,
  ): any[] => {
    if (!orderByExpr || orderByExpr.length === 0) return [];

    return orderByExpr.map((order) => {
      const fieldPath = order.field;
      const fieldName = fieldPath[fieldPath.length - 1];
      const column = table[fieldName];

      if (!column) {
        throw new Error(`Field ${fieldName} not found in table`);
      }

      return order.direction === "asc" ? asc(column) : desc(column);
    });
  };

  // Helper to serialize entity for output
  const serializeEntity = (entity: any): z.infer<TEntitySchema> => {
    // Parse toolSet if it's a string
    if (entity.toolSet && typeof entity.toolSet === "string") {
      try {
        entity.toolSet = JSON.parse(entity.toolSet);
      } catch {
        // If parsing fails, keep as string
      }
    }
    return entity;
  };

  // LIST Tool
  const createListTool = (env: Env) =>
    createPrivateTool({
      id: toolName("LIST"),
      description: `List ${collectionName} with filtering, sorting, and pagination`,
      inputSchema: CollectionListInputSchema,
      outputSchema: createCollectionListOutputSchema(entitySchema),
      execute: async ({ context }) => {
        const db = await getDb(env);
        const { where, orderBy, limit = 50, offset = 0 } = context;

        let query = db.select().from(drizzleTable);

        // Apply where clause
        if (where) {
          const whereCondition = buildWhereCondition(where, drizzleTable);
          if (whereCondition) {
            query = query.where(whereCondition);
          }
        }

        // Apply order by
        if (orderBy && orderBy.length > 0) {
          const orderByClause = buildOrderBy(orderBy, drizzleTable);
          if (orderByClause.length > 0) {
            query = query.orderBy(...orderByClause);
          }
        }

        // Apply pagination
        query = query.limit(limit).offset(offset);

        const items = await query;
        const serializedItems = items.map(serializeEntity);

        // Get total count (without pagination)
        let countQuery = db
          .select({ count: sql<number>`count(*)` })
          .from(drizzleTable);
        if (where) {
          const whereCondition = buildWhereCondition(where, drizzleTable);
          if (whereCondition) {
            countQuery = countQuery.where(whereCondition);
          }
        }
        const countResult = await countQuery;
        const totalCount = countResult[0]?.count || 0;

        return {
          items: serializedItems,
          totalCount,
          hasMore: offset + items.length < totalCount,
        };
      },
    });

  // GET Tool
  const createGetTool = (env: Env) =>
    createPrivateTool({
      id: toolName("GET"),
      description: `Get a single ${collectionName.slice(0, -1)} by ID`,
      inputSchema: CollectionGetInputSchema,
      outputSchema: createCollectionGetOutputSchema(entitySchema),
      execute: async ({ context }) => {
        const db = await getDb(env);
        const { id } = context;

        const result = await db
          .select()
          .from(drizzleTable)
          .where(eq(drizzleTable.id, id))
          .limit(1);

        const item = result[0] || null;

        return {
          item: item ? serializeEntity(item) : null,
        };
      },
    });

  // INSERT Tool
  const createInsertTool = (env: Env) =>
    createPrivateTool({
      id: toolName("INSERT"),
      description: `Create a new ${collectionName.slice(0, -1)}`,
      inputSchema: createCollectionInsertInputSchema(entitySchema),
      outputSchema: createCollectionInsertOutputSchema(entitySchema),
      execute: async ({ context }) => {
        const db = await getDb(env);
        const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();

        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        // Serialize toolSet if it's an object
        const data = { ...context.data };
        if (data.toolSet && typeof data.toolSet === "object") {
          data.toolSet = JSON.stringify(data.toolSet);
        }

        const newEntity = {
          id,
          ...data,
          created_at: now,
          updated_at: now,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        };

        await db.insert(drizzleTable).values(newEntity);

        const insertedItem = await db
          .select()
          .from(drizzleTable)
          .where(eq(drizzleTable.id, id))
          .limit(1);

        return {
          item: serializeEntity(insertedItem[0]),
        };
      },
    });

  // UPDATE Tool
  const createUpdateTool = (env: Env) =>
    createPrivateTool({
      id: toolName("UPDATE"),
      description: `Update an existing ${collectionName.slice(0, -1)}`,
      inputSchema: createCollectionUpdateInputSchema(entitySchema),
      outputSchema: createCollectionUpdateOutputSchema(entitySchema),
      execute: async ({ context }) => {
        const db = await getDb(env);
        const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
        const { id, data } = context;

        const now = new Date().toISOString();

        // Serialize toolSet if it's an object
        const updateData = { ...data };
        if (updateData.toolSet && typeof updateData.toolSet === "object") {
          updateData.toolSet = JSON.stringify(updateData.toolSet);
        }

        await db
          .update(drizzleTable)
          .set({
            ...updateData,
            updated_at: now,
            updated_by: user?.id || null,
          })
          .where(eq(drizzleTable.id, id));

        const updatedItem = await db
          .select()
          .from(drizzleTable)
          .where(eq(drizzleTable.id, id))
          .limit(1);

        return {
          item: serializeEntity(updatedItem[0]),
        };
      },
    });

  // DELETE Tool
  const createDeleteTool = (env: Env) =>
    createPrivateTool({
      id: toolName("DELETE"),
      description: `Delete a ${collectionName.slice(0, -1)} by ID`,
      inputSchema: CollectionDeleteInputSchema,
      outputSchema: CollectionDeleteOutputSchema,
      execute: async ({ context }) => {
        const db = await getDb(env);
        const { id } = context;

        await db.delete(drizzleTable).where(eq(drizzleTable.id, id));

        return {
          success: true,
          id,
        };
      },
    });

  // Return array of tool factory functions
  return [
    createListTool,
    createGetTool,
    createInsertTool,
    createUpdateTool,
    createDeleteTool,
  ];
}
