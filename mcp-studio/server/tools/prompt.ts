/**
 * Prompt Binding Implementation
 *
 * Implements CRUD operations for MCP Prompts following the MCP specification:
 * - COLLECTION_PROMPT_LIST: Query prompts with filtering, sorting, and pagination
 * - COLLECTION_PROMPT_GET: Fetch a single prompt by ID
 * - COLLECTION_PROMPT_CREATE: Create a new prompt
 * - COLLECTION_PROMPT_UPDATE: Update an existing prompt
 * - COLLECTION_PROMPT_DELETE: Delete a prompt
 */

import {
  CollectionGetInputSchema,
  createCollectionGetOutputSchema,
} from "@decocms/bindings/collections";
import {
  PROMPTS_COLLECTION_BINDING,
  PromptSchema,
} from "@decocms/bindings/prompt";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z, type ZodType } from "zod";
import { runSQL } from "../db/postgres.ts";
import {
  buildOrderByClause,
  buildWhereClause,
  type OrderByExpression,
  type WhereExpression,
} from "../db/schemas/query-builder.ts";
import type { Env } from "../types/env.ts";

// ============================================================================
// Schemas (following MCP Prompts specification)
// ============================================================================

// Extract binding schemas
const LIST_BINDING = PROMPTS_COLLECTION_BINDING.find(
  (b) => b.name === "COLLECTION_PROMPT_LIST",
);
const GET_BINDING = PROMPTS_COLLECTION_BINDING.find(
  (b) => b.name === "COLLECTION_PROMPT_GET",
);
const CREATE_BINDING = PROMPTS_COLLECTION_BINDING.find(
  (b) => b.name === "COLLECTION_PROMPT_CREATE",
);
const UPDATE_BINDING = PROMPTS_COLLECTION_BINDING.find(
  (b) => b.name === "COLLECTION_PROMPT_UPDATE",
);
const DELETE_BINDING = PROMPTS_COLLECTION_BINDING.find(
  (b) => b.name === "COLLECTION_PROMPT_DELETE",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_PROMPT_LIST binding not found or missing schemas",
  );
}
if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error("COLLECTION_PROMPT_GET binding not found or missing schemas");
}
if (!CREATE_BINDING?.inputSchema || !CREATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_PROMPT_CREATE binding not found or missing schemas",
  );
}
if (!UPDATE_BINDING?.inputSchema || !UPDATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_PROMPT_UPDATE binding not found or missing schemas",
  );
}
if (!DELETE_BINDING?.inputSchema || !DELETE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_PROMPT_DELETE binding not found or missing schemas",
  );
}

/**
 * Parse JSONB fields from database row
 */
function parsePromptRow(
  row: Record<string, unknown>,
): z.infer<typeof PromptSchema> {
  return {
    ...row,
    arguments: row.arguments || [],
    icons: row.icons || [],
    messages: row.messages || [],
  } as z.infer<typeof PromptSchema>;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_PROMPT_LIST - Query prompts with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_PROMPT_LIST",
    description: "List prompts with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema as ZodType,
    execute: async ({ context }) => {
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
        SELECT * FROM prompts
        ${whereClause}
        ${orderByClause}
        LIMIT ? OFFSET ?
      `;

      const items = await runSQL(env, query, [...params, limit, offset]);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM prompts ${whereClause}`;
      const countResult = await runSQL<{ count: string | number }>(
        env,
        countQuery,
        params,
      );
      const totalCount = parseInt(String(countResult[0]?.count || "0"), 10);

      return {
        items: items.map((item) =>
          parsePromptRow(item as Record<string, unknown>),
        ),
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },
  });

/**
 * COLLECTION_PROMPT_GET - Fetch a single prompt by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_PROMPT_GET",
    description: "Get a single prompt by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(PromptSchema),
    execute: async ({ context }) => {
      const { id } = context;

      const result = await runSQL(
        env,
        `SELECT * FROM prompts WHERE id = ? LIMIT 1`,
        [id],
      );

      const item = result[0] || null;

      return {
        item: item ? parsePromptRow(item as Record<string, unknown>) : null,
      };
    },
  });

/**
 * COLLECTION_PROMPT_CREATE - Create a new prompt
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_PROMPT_CREATE",
    description: "Create a new prompt",
    inputSchema: CREATE_BINDING.inputSchema,
    outputSchema: CREATE_BINDING.outputSchema as ZodType,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof CREATE_BINDING.inputSchema>;
    }) => {
      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { data } = context;

      const id = data.id ?? crypto.randomUUID();

      await runSQL(
        env,
        `
          INSERT INTO prompts (
            id, title, created_at, updated_at, created_by, updated_by,
            description, arguments, icons, messages
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          JSON.stringify(data.arguments || []),
          JSON.stringify(data.icons || []),
          JSON.stringify(data.messages || []),
        ],
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM prompts WHERE id = ? LIMIT 1`,
        [id],
      );

      const insertedItem = result[0];
      if (!insertedItem) {
        throw new Error(`Failed to insert prompt`);
      }

      return {
        item: parsePromptRow(insertedItem),
      };
    },
  });

/**
 * COLLECTION_PROMPT_UPDATE - Update an existing prompt
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_PROMPT_UPDATE",
    description: "Update an existing prompt",
    inputSchema: UPDATE_BINDING.inputSchema,
    outputSchema: UPDATE_BINDING.outputSchema as ZodType,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof UPDATE_BINDING.inputSchema>;
    }) => {
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
        params.push(data.description);
      }
      if (data.arguments !== undefined) {
        setClauses.push("arguments = ?");
        params.push(JSON.stringify(data.arguments));
      }
      if (data.icons !== undefined) {
        setClauses.push("icons = ?");
        params.push(JSON.stringify(data.icons));
      }
      if (data.messages !== undefined) {
        setClauses.push("messages = ?");
        params.push(JSON.stringify(data.messages));
      }

      // Add id for WHERE clause
      params.push(id);

      await runSQL(
        env,
        `UPDATE prompts SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      const result = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM prompts WHERE id = ? LIMIT 1`,
        [id],
      );

      const updatedItem = result[0];
      if (!updatedItem) {
        throw new Error(`Prompt with id ${id} not found`);
      }

      return {
        item: parsePromptRow(updatedItem),
      };
    },
  });

/**
 * COLLECTION_PROMPT_DELETE - Delete a prompt by ID
 */
export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_PROMPT_DELETE",
    description: "Delete a prompt by ID",
    inputSchema: DELETE_BINDING.inputSchema,
    outputSchema: DELETE_BINDING.outputSchema as ZodType,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof DELETE_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      // Get the prompt before deleting
      const existing = await runSQL<Record<string, unknown>>(
        env,
        `SELECT * FROM prompts WHERE id = ? LIMIT 1`,
        [id],
      );

      const prompt = existing[0];
      if (!prompt) {
        throw new Error(`Prompt with id ${id} not found`);
      }

      await runSQL(env, `DELETE FROM prompts WHERE id = ?`, [id]);

      return {
        item: parsePromptRow(prompt),
      };
    },
  });

// Export all tools as an array
export const promptTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
];
