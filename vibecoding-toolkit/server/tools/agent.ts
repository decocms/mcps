/**
 * Agent Collection Tools
 *
 * Implements the 5 standard collection operations for agents:
 * - LIST: Query agents with filtering, sorting, and pagination
 * - GET: Fetch a single agent by ID
 * - INSERT: Create a new agent
 * - UPDATE: Update an existing agent
 * - DELETE: Delete an agent
 */

import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { getPostgres, ensureAgentsTable } from "../lib/postgres.ts";
import type { Env } from "../main.ts";
import {
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

// Agent schema extending BaseCollectionEntitySchema
const AgentSchema = BaseCollectionEntitySchema.extend({
  description: z.string(),
  instructions: z.string(),
  tool_set: z.record(z.string(), z.array(z.string())),
});

type WhereExpression = z.infer<typeof CollectionListInputSchema>["where"];
type OrderByExpression = z.infer<typeof CollectionListInputSchema>["orderBy"];

/**
 * Build SQL WHERE clause from filter expression
 */
function buildWhereClause(
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

/**
 * Build SQL ORDER BY clause from sort expression
 */
function buildOrderByClause(orderByExpr: OrderByExpression): string {
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

/**
 * LIST Tool - Query agents with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_AGENTS_LIST",
    description: "List agents with filtering, sorting, and pagination",
    inputSchema: CollectionListInputSchema,
    outputSchema: createCollectionListOutputSchema(AgentSchema),
    execute: async ({ context }) => {
      await ensureAgentsTable(env);
      const sql = getPostgres(env);

      const { where, orderBy, limit = 50, offset = 0 } = context;

      // Build WHERE clause
      let whereClause = "";
      let params: any[] = [];
      if (where) {
        const result = buildWhereClause(where, params);
        whereClause = result.clause ? `WHERE ${result.clause}` : "";
        params = result.params;
      }

      // Build ORDER BY clause
      const orderByClause = buildOrderByClause(orderBy);

      // Query items with pagination
      const query = `
        SELECT * FROM agents
        ${whereClause}
        ${orderByClause}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const items = await sql.unsafe(query, [...params, limit, offset]);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM agents ${whereClause}`;
      const countResult = await sql.unsafe(countQuery, params);
      const totalCount = parseInt(countResult[0]?.count || "0", 10);

      return {
        items: items.map((item: any) => ({
          ...item,
          tool_set: item.tool_set || {},
        })),
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },
  });

/**
 * GET Tool - Fetch a single agent by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_AGENTS_GET",
    description: "Get a single agent by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(AgentSchema),
    execute: async ({ context }) => {
      await ensureAgentsTable(env);
      const sql = getPostgres(env);

      const { id } = context;

      const result = await sql`
        SELECT * FROM agents WHERE id = ${id} LIMIT 1
      `;

      const item = result[0] || null;

      return {
        item: item
          ? ({
              ...item,
              tool_set: item.tool_set || {},
            } as z.infer<typeof AgentSchema>)
          : null,
      };
    },
  });

/**
 * INSERT Tool - Create a new agent
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_AGENTS_INSERT",
    description: "Create a new agent",
    inputSchema: createCollectionInsertInputSchema(AgentSchema),
    outputSchema: createCollectionInsertOutputSchema(AgentSchema),
    execute: async ({ context }) => {
      await ensureAgentsTable(env);
      const sql = getPostgres(env);

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const { data } = context;

      const result = await sql`
        INSERT INTO agents (
          id, title, created_at, updated_at, created_by, updated_by,
          description, instructions, tool_set
        ) VALUES (
          ${id},
          ${data.title},
          ${now},
          ${now},
          ${user?.id || null},
          ${user?.id || null},
          ${data.description},
          ${data.instructions},
          ${JSON.stringify(data.tool_set || {})}
        )
        RETURNING *
      `;

      return {
        item: {
          ...result[0],
          tool_set: result[0].tool_set || {},
        } as z.infer<typeof AgentSchema>,
      };
    },
  });

/**
 * UPDATE Tool - Update an existing agent
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_AGENTS_UPDATE",
    description: "Update an existing agent",
    inputSchema: createCollectionUpdateInputSchema(AgentSchema),
    outputSchema: createCollectionUpdateOutputSchema(AgentSchema),
    execute: async ({ context }) => {
      await ensureAgentsTable(env);
      const sql = getPostgres(env);

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { id, data } = context;

      // Build SET clause dynamically based on provided fields
      const updates: any = {
        updated_at: now,
        updated_by: user?.id || null,
      };

      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined)
        updates.description = data.description;
      if (data.instructions !== undefined)
        updates.instructions = data.instructions;
      if (data.tool_set !== undefined)
        updates.tool_set = JSON.stringify(data.tool_set);

      const result = await sql`
        UPDATE agents
        SET ${sql(updates)}
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.length === 0) {
        throw new Error(`Agent with id ${id} not found`);
      }

      return {
        item: {
          ...result[0],
          tool_set: result[0].tool_set || {},
        } as z.infer<typeof AgentSchema>,
      };
    },
  });

/**
 * DELETE Tool - Delete an agent by ID
 */
export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_AGENTS_DELETE",
    description: "Delete an agent by ID",
    inputSchema: CollectionDeleteInputSchema,
    outputSchema: CollectionDeleteOutputSchema,
    execute: async ({ context }) => {
      await ensureAgentsTable(env);
      const sql = getPostgres(env);

      const { id } = context;

      await sql`
        DELETE FROM agents WHERE id = ${id}
      `;

      return {
        success: true,
        id,
      };
    },
  });

// Export all tools as an array
export const agentTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
];
