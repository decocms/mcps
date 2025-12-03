/**
 * Agent Binding Implementation
 *
 * Implements the AGENTS_BINDING from @decocms/bindings/agent:
 * - COLLECTION_AGENT_LIST: Query agents with filtering, sorting, and pagination
 * - COLLECTION_AGENT_GET: Fetch a single agent by ID
 * - COLLECTION_AGENT_CREATE: Create a new agent
 * - COLLECTION_AGENT_UPDATE: Update an existing agent
 * - COLLECTION_AGENT_DELETE: Delete an agent
 */

import { AGENTS_BINDING, AgentSchema } from "@decocms/bindings/agent";
import {
  CollectionGetInputSchema,
  createCollectionGetOutputSchema,
} from "@decocms/bindings/collections";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { ensureAgentsTable } from "../lib/postgres.ts";
import type { Env } from "../main.ts";

// ============================================================================
// Types
// ============================================================================

type WhereExpression = {
  field?: string[];
  operator?: string;
  value?: unknown;
  conditions?: WhereExpression[];
};

type OrderByExpression = Array<{
  field: string[];
  direction: string;
  nulls?: string;
}>;

// Extract binding schemas
const LIST_BINDING = AGENTS_BINDING.find(
  (b) => b.name === "COLLECTION_AGENT_LIST",
);
const GET_BINDING = AGENTS_BINDING.find(
  (b) => b.name === "COLLECTION_AGENT_GET",
);
const CREATE_BINDING = AGENTS_BINDING.find(
  (b) => b.name === "COLLECTION_AGENT_CREATE",
);
const UPDATE_BINDING = AGENTS_BINDING.find(
  (b) => b.name === "COLLECTION_AGENT_UPDATE",
);
const DELETE_BINDING = AGENTS_BINDING.find(
  (b) => b.name === "COLLECTION_AGENT_DELETE",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error("COLLECTION_AGENT_LIST binding not found or missing schemas");
}
if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error("COLLECTION_AGENT_GET binding not found or missing schemas");
}
if (!CREATE_BINDING?.inputSchema || !CREATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_AGENT_CREATE binding not found or missing schemas",
  );
}
if (!UPDATE_BINDING?.inputSchema || !UPDATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_AGENT_UPDATE binding not found or missing schemas",
  );
}
if (!DELETE_BINDING?.inputSchema || !DELETE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_AGENT_DELETE binding not found or missing schemas",
  );
}

// ============================================================================
// Standard Agent (always available)
// ============================================================================

const STANDARD_AGENT: z.infer<typeof AgentSchema> = {
  id: "standard",
  title: "Standard Agent",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  created_by: undefined,
  updated_by: undefined,
  description: "The default standard agent",
  instructions: "",
  tool_set: {},
  avatar: "https://assets.webdraw.app/uploads/capy.png",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build SQL WHERE clause from filter expression using ? placeholders
 */
function buildWhereClause(
  whereExpr: WhereExpression | undefined,
  params: unknown[] = [],
): { clause: string; params: unknown[] } {
  if (!whereExpr) {
    return { clause: "", params };
  }

  // Simple condition
  if (
    "field" in whereExpr &&
    "operator" in whereExpr &&
    !("conditions" in whereExpr)
  ) {
    const fieldPath = whereExpr.field;
    if (!fieldPath) return { clause: "", params };
    const fieldName = fieldPath[fieldPath.length - 1];

    switch (whereExpr.operator) {
      case "eq":
        params.push(whereExpr.value);
        return { clause: `${fieldName} = ?`, params };
      case "gt":
        params.push(whereExpr.value);
        return { clause: `${fieldName} > ?`, params };
      case "gte":
        params.push(whereExpr.value);
        return { clause: `${fieldName} >= ?`, params };
      case "lt":
        params.push(whereExpr.value);
        return { clause: `${fieldName} < ?`, params };
      case "lte":
        params.push(whereExpr.value);
        return { clause: `${fieldName} <= ?`, params };
      case "in": {
        const values = Array.isArray(whereExpr.value)
          ? whereExpr.value
          : [whereExpr.value];
        // Create placeholders for each value in the IN clause
        const placeholders = values.map(() => "?").join(", ");
        params.push(...values);
        return { clause: `${fieldName} IN (${placeholders})`, params };
      }
      case "like":
      case "contains":
        params.push(`%${whereExpr.value}%`);
        return { clause: `${fieldName} LIKE ?`, params };
      default:
        throw new Error(`Unsupported operator: ${whereExpr.operator}`);
    }
  }

  // Logical condition (and, or, not)
  if ("operator" in whereExpr && "conditions" in whereExpr) {
    const conditions = (whereExpr.conditions || []).map((cond) => {
      const result = buildWhereClause(cond, params);
      params = result.params;
      return result.clause;
    });

    switch (whereExpr.operator) {
      case "and":
        return { clause: `(${conditions.join(" AND ")})`, params };
      case "or":
        return { clause: `(${conditions.join(" OR ")})`, params };
      case "not":
        return { clause: `NOT (${conditions[0]})`, params };
      default:
        throw new Error(`Unsupported logical operator: ${whereExpr.operator}`);
    }
  }

  return { clause: "", params };
}

/**
 * Build SQL ORDER BY clause from sort expression
 */
function buildOrderByClause(
  orderByExpr: OrderByExpression | undefined,
): string {
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

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_AGENT_LIST - Query agents with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_AGENT_LIST",
    description: "List agents with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({ context }) => {
      // If DATABASE is not available, return only the standard agent
      if (!env.DATABASE) {
        return {
          items: [STANDARD_AGENT],
          totalCount: 1,
          hasMore: false,
        };
      }

      await ensureAgentsTable(env);

      const { where, orderBy, limit = 50, offset = 0 } = context;

      // Build WHERE clause
      let whereClause = "";
      let params: unknown[] = [];
      if (where) {
        const result = buildWhereClause(where as WhereExpression, params);
        whereClause = result.clause ? `WHERE ${result.clause}` : "";
        params = result.params;
      }

      // Build ORDER BY clause
      const orderByClause = buildOrderByClause(orderBy as OrderByExpression);

      // Query items with pagination
      const query = `
				SELECT * FROM agents
				${whereClause}
				${orderByClause}
				LIMIT ? OFFSET ?
			`;

      const items = await runSQL(env, query, [...params, limit, offset]);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM agents ${whereClause}`;
      const countResult = await runSQL<{ count: string | number }>(
        env,
        countQuery,
        params,
      );
      const totalCount = parseInt(String(countResult[0]?.count || "0"), 10);

      return {
        items: items.map((item) => {
          const record = item as Record<string, unknown>;
          return {
            ...record,
            tool_set: record.tool_set || {},
          } as z.infer<typeof AgentSchema>;
        }),
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },
  });

/**
 * COLLECTION_AGENT_GET - Fetch a single agent by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_AGENT_GET",
    description: "Get a single agent by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(AgentSchema),
    execute: async ({ context }) => {
      await ensureAgentsTable(env);

      const { id } = context;

      const result = await runSQL(
        env,
        `SELECT * FROM agents WHERE id = ? LIMIT 1`,
        [id],
      );

      const item = result[0] || null;

      return {
        item: item
          ? ({
              ...(item as Record<string, unknown>),
              tool_set: (item as Record<string, unknown>).tool_set || {},
            } as z.infer<typeof AgentSchema>)
          : null,
      };
    },
  });

/**
 * COLLECTION_AGENT_CREATE - Create a new agent
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_AGENT_CREATE",
    description: "Create a new agent",
    inputSchema: CREATE_BINDING.inputSchema,
    outputSchema: CREATE_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof CREATE_BINDING.inputSchema>;
    }) => {
      await ensureAgentsTable(env);

      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const { data } = context;

      await runSQL(
        env,
        `
				INSERT INTO agents (
					id, title, created_at, updated_at, created_by, updated_by,
					description, instructions, tool_set
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
        [
          id,
          data.title,
          now,
          now,
          user?.id || null,
          user?.id || null,
          data.description,
          data.instructions,
          JSON.stringify(data.tool_set || {}),
        ],
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM agents WHERE id = ? LIMIT 1`,
        [id],
      );

      const insertedItem = result[0];
      if (!insertedItem) {
        throw new Error(`Failed to insert agent`);
      }

      return {
        item: {
          ...insertedItem,
          tool_set: insertedItem.tool_set || {},
        } as z.infer<typeof AgentSchema>,
      };
    },
  });

/**
 * COLLECTION_AGENT_UPDATE - Update an existing agent
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_AGENT_UPDATE",
    description: "Update an existing agent",
    inputSchema: UPDATE_BINDING.inputSchema,
    outputSchema: UPDATE_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof UPDATE_BINDING.inputSchema>;
    }) => {
      await ensureAgentsTable(env);

      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { id, data } = context;

      // Build SET clause dynamically based on provided fields
      const setClauses: string[] = ["updated_at = ?", "updated_by = ?"];
      const params: unknown[] = [now, user?.id || null];

      if (data.title !== undefined) {
        setClauses.push("title = ?");
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push("description = ?");
        params.push(data.description);
      }
      if (data.instructions !== undefined) {
        setClauses.push("instructions = ?");
        params.push(data.instructions);
      }
      if (data.tool_set !== undefined) {
        setClauses.push("tool_set = ?");
        params.push(JSON.stringify(data.tool_set));
      }

      // Add id for WHERE clause
      params.push(id);

      await runSQL(
        env,
        `UPDATE agents SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM agents WHERE id = ? LIMIT 1`,
        [id],
      );

      const updatedItem = result[0];
      if (!updatedItem) {
        throw new Error(`Agent with id ${id} not found`);
      }

      return {
        item: {
          ...updatedItem,
          tool_set: updatedItem.tool_set || {},
        } as z.infer<typeof AgentSchema>,
      };
    },
  });

/**
 * COLLECTION_AGENT_DELETE - Delete an agent by ID
 */
export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_AGENT_DELETE",
    description: "Delete an agent by ID",
    inputSchema: DELETE_BINDING.inputSchema,
    outputSchema: z.object({
      item: z.object({
        id: z.string(),
      }),
    }),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof DELETE_BINDING.inputSchema>;
    }) => {
      await ensureAgentsTable(env);

      const { id } = context;

      // Get the agent before deleting
      const existing = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM agents WHERE id = ? LIMIT 1`,
        [id],
      );

      const agent = existing[0];
      if (!agent) {
        throw new Error(`Agent with id ${id} not found`);
      }

      await runSQL(env, `DELETE FROM agents WHERE id = ?`, [id]);

      return {
        item: {
          id,
        },
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
