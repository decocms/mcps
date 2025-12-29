/**
 * Assistant Binding Implementation
 *
 * Implements the ASSISTANTS_BINDING from @decocms/bindings/assistant:
 * - COLLECTION_ASSISTANT_LIST: Query assistants with filtering, sorting, and pagination
 * - COLLECTION_ASSISTANT_GET: Fetch a single assistant by ID
 * - COLLECTION_ASSISTANT_CREATE: Create a new assistant
 * - COLLECTION_ASSISTANT_UPDATE: Update an existing assistant
 * - COLLECTION_ASSISTANT_DELETE: Delete an assistant
 */

import {
  ASSISTANTS_BINDING,
  AssistantSchema,
} from "@decocms/bindings/assistant";
import {
  CollectionGetInputSchema,
  CollectionDeleteInputSchema,
  createCollectionGetOutputSchema,
  createCollectionInsertInputSchema,
  createCollectionInsertOutputSchema,
  createCollectionUpdateInputSchema,
  createCollectionUpdateOutputSchema,
  createCollectionDeleteOutputSchema,
} from "@decocms/bindings/collections";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";
import { type WhereExpression, type OrderByExpression } from "./_helpers.ts";

// Extract binding schemas
const LIST_BINDING = ASSISTANTS_BINDING.find(
  (b) => b.name === "COLLECTION_ASSISTANT_LIST",
);
const GET_BINDING = ASSISTANTS_BINDING.find(
  (b) => b.name === "COLLECTION_ASSISTANT_GET",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_ASSISTANT_LIST binding not found or missing schemas",
  );
}
if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_ASSISTANT_GET binding not found or missing schemas",
  );
}

// Legacy mutation tools are intentionally kept (tool IDs stay the same),
// but Assistant well-known binding is read-only (LIST + GET only).
const CREATE_INPUT_SCHEMA = createCollectionInsertInputSchema(AssistantSchema);
const CREATE_OUTPUT_SCHEMA =
  createCollectionInsertOutputSchema(AssistantSchema);
const UPDATE_INPUT_SCHEMA = createCollectionUpdateInputSchema(AssistantSchema);
const UPDATE_OUTPUT_SCHEMA =
  createCollectionUpdateOutputSchema(AssistantSchema);
const DELETE_OUTPUT_SCHEMA =
  createCollectionDeleteOutputSchema(AssistantSchema);

// ============================================================================
// Helper Functions
// ============================================================================

const DEFAULT_MODEL: z.infer<typeof AssistantSchema>["model"] = {
  id: "",
  connectionId: "",
};

function normalizeModel(
  value: unknown,
): z.infer<typeof AssistantSchema>["model"] {
  if (!value) return DEFAULT_MODEL;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "id" in parsed &&
        "connectionId" in parsed
      ) {
        const p = parsed as { id: unknown; connectionId: unknown };
        return {
          id: typeof p.id === "string" ? p.id : DEFAULT_MODEL.id,
          connectionId:
            typeof p.connectionId === "string"
              ? p.connectionId
              : DEFAULT_MODEL.connectionId,
        };
      }
    } catch {
      // fallthrough
    }
    return DEFAULT_MODEL;
  }
  if (typeof value === "object") {
    const v = value as { id?: unknown; connectionId?: unknown };
    return {
      id: typeof v.id === "string" ? v.id : DEFAULT_MODEL.id,
      connectionId:
        typeof v.connectionId === "string"
          ? v.connectionId
          : DEFAULT_MODEL.connectionId,
    };
  }
  return DEFAULT_MODEL;
}

function mapDbRowToAssistant(
  row: Record<string, unknown>,
): z.infer<typeof AssistantSchema> {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description:
      row.description === null || row.description === undefined
        ? null
        : String(row.description),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
    created_by: (row.created_by as string | undefined) ?? undefined,
    updated_by: (row.updated_by as string | undefined) ?? undefined,
    avatar: String(
      row.avatar ??
        "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png",
    ),
    system_prompt: String(row.system_prompt ?? ""),
    gateway_id: String(row.gateway_id ?? ""),
    model: normalizeModel(row.model),
  };
}

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
 * COLLECTION_ASSISTANT_LIST - Query assistants with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_ASSISTANT_LIST",
    description: "List assistants with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({ context }) => {
      // If DATABASE is not available, return empty list
      if (!env.DATABASE) {
        return {
          items: [],
          totalCount: 0,
          hasMore: false,
        };
      }

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
				SELECT * FROM assistants
				${whereClause}
				${orderByClause}
				LIMIT ? OFFSET ?
			`;

      const items = await runSQL(env, query, [...params, limit, offset]);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM assistants ${whereClause}`;
      const countResult = await runSQL<{ count: string | number }>(
        env,
        countQuery,
        params,
      );
      const totalCount = parseInt(String(countResult[0]?.count || "0"), 10);

      return {
        items: (items as Record<string, unknown>[]).map(mapDbRowToAssistant),
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },
  });

/**
 * COLLECTION_ASSISTANT_GET - Fetch a single assistant by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_ASSISTANT_GET",
    description: "Get a single assistant by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(AssistantSchema),
    execute: async ({ context }) => {
      if (!env.DATABASE) {
        return { item: null };
      }

      const { id } = context;

      const result = await runSQL(
        env,
        `SELECT * FROM assistants WHERE id = ? LIMIT 1`,
        [id],
      );

      const item = result[0] || null;

      return {
        item: item
          ? mapDbRowToAssistant(item as Record<string, unknown>)
          : null,
      };
    },
  });

/**
 * COLLECTION_ASSISTANT_CREATE - Create a new assistant
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_ASSISTANT_CREATE",
    description: "Create a new assistant",
    inputSchema: CREATE_INPUT_SCHEMA,
    outputSchema: CREATE_OUTPUT_SCHEMA,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof CREATE_INPUT_SCHEMA>;
    }) => {
      if (!env.DATABASE) {
        throw new Error("DATABASE not configured for mcp-studio");
      }

      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { data } = context;

      const id = data.id ?? crypto.randomUUID();

      const model = data.model ?? DEFAULT_MODEL;

      await runSQL(
        env,
        `
				INSERT INTO assistants (
					id, title, created_at, updated_at, created_by, updated_by,
					description, instructions, tool_set, avatar,
          system_prompt, gateway_id, model
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (id) DO NOTHING
			`,
        [
          id,
          data.title ?? "",
          now,
          now,
          user?.id || "unknown",
          user?.id || "unknown",
          data.description ?? "",
          "",
          JSON.stringify({}),
          data.avatar ??
            "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png",
          data.system_prompt ?? "",
          data.gateway_id ?? "",
          JSON.stringify(model),
        ],
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM assistants WHERE id = ? LIMIT 1`,
        [id],
      );

      const insertedItem = result[0];
      if (!insertedItem) {
        throw new Error(`Failed to insert assistant`);
      }

      return {
        item: mapDbRowToAssistant(insertedItem),
      };
    },
  });

/**
 * COLLECTION_ASSISTANT_UPDATE - Update an existing assistant
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_ASSISTANT_UPDATE",
    description: "Update an existing assistant",
    inputSchema: UPDATE_INPUT_SCHEMA,
    outputSchema: UPDATE_OUTPUT_SCHEMA,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof UPDATE_INPUT_SCHEMA>;
    }) => {
      if (!env.DATABASE) {
        throw new Error("DATABASE not configured for mcp-studio");
      }

      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();

      const now = new Date().toISOString();

      const { id, data } = context;

      // Build SET clause dynamically based on provided fields
      const setClauses: string[] = ["updated_at = ?", "updated_by = ?"];
      const params: unknown[] = [now, user?.id || "unknown"];

      if (data.title !== undefined) {
        setClauses.push("title = ?");
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push("description = ?");
        params.push(data.description ?? "");
      }
      if (data.avatar !== undefined) {
        setClauses.push("avatar = ?");
        params.push(data.avatar);
      }
      if (data.system_prompt !== undefined) {
        setClauses.push("system_prompt = ?");
        params.push(data.system_prompt);
      }
      if (data.gateway_id !== undefined) {
        setClauses.push("gateway_id = ?");
        params.push(data.gateway_id);
      }
      if (data.model !== undefined) {
        setClauses.push("model = ?");
        params.push(JSON.stringify(data.model));
      }

      // Add id for WHERE clause
      params.push(id);

      await runSQL(
        env,
        `UPDATE assistants SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM assistants WHERE id = ? LIMIT 1`,
        [id],
      );

      const updatedItem = result[0];
      if (!updatedItem) {
        throw new Error(`Assistant with id ${id} not found`);
      }

      return {
        item: mapDbRowToAssistant(updatedItem),
      };
    },
  });

/**
 * COLLECTION_ASSISTANT_DELETE - Delete an assistant by ID
 */
export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_ASSISTANT_DELETE",
    description: "Delete an assistant by ID",
    inputSchema: CollectionDeleteInputSchema,
    outputSchema: DELETE_OUTPUT_SCHEMA,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof CollectionDeleteInputSchema>;
    }) => {
      if (!env.DATABASE) {
        throw new Error("DATABASE not configured for mcp-studio");
      }

      const { id } = context;

      // Get the assistant before deleting
      const existing = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM assistants WHERE id = ? LIMIT 1`,
        [id],
      );

      const assistant = existing[0];
      if (!assistant) {
        throw new Error(`Assistant with id ${id} not found`);
      }

      await runSQL(env, `DELETE FROM assistants WHERE id = ?`, [id]);

      return {
        item: mapDbRowToAssistant(assistant),
      };
    },
  });

// Export all tools as an array
export const assistantTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
];
