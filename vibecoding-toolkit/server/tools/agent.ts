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
import {
  buildOrderByClause,
  buildWhereClause,
  ensureTable,
} from "../lib/postgres.ts";
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

/**
 * Transform database row to match AgentSchema
 */
function transformDbRowToAgent(row: any): z.infer<typeof AgentSchema> {
  return {
    id: row.id,
    title: row.title,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
    created_by: row.created_by || undefined,
    updated_by: row.updated_by || undefined,
    description: row.description,
    instructions: row.instructions,
    tool_set:
      typeof row.tool_set === "string"
        ? JSON.parse(row.tool_set)
        : row.tool_set || {},
  };
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
      await ensureTable(env, "agents");

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

      const itemsResult = await env.POSTGRES.RUN_SQL({
        query,
        params: [...params, limit, offset],
      });

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM agents ${whereClause}`;
      const countResult = await env.POSTGRES.RUN_SQL({
        query: countQuery,
        params,
      });
      const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);

      return {
        items: itemsResult.rows.map((item: any) => transformDbRowToAgent(item)),
        totalCount,
        hasMore: offset + itemsResult.rows.length < totalCount,
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
      await ensureTable(env, "agents");

      const { id } = context;

      const result = await env.POSTGRES.RUN_SQL({
        query: "SELECT * FROM agents WHERE id = $1 LIMIT 1",
        params: [id],
      });

      const item = result.rows[0] || null;

      return {
        item: item ? transformDbRowToAgent(item) : null,
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
      await ensureTable(env, "agents");

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const { data } = context;

      const result = await env.POSTGRES.RUN_SQL({
        query: `
          INSERT INTO agents (
            id, title, created_at, updated_at, created_by, updated_by,
            description, instructions, tool_set
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          RETURNING *
        `,
        params: [
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
      });

      return {
        item: transformDbRowToAgent(result.rows[0]),
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
      await ensureTable(env, "agents");

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { id, data } = context;

      // Build SET clause dynamically based on provided fields
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Always update these fields
      setClauses.push(`updated_at = $${paramIndex++}`);
      params.push(now);

      setClauses.push(`updated_by = $${paramIndex++}`);
      params.push(user?.id || null);

      // Conditionally update other fields
      if (data.title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.instructions !== undefined) {
        setClauses.push(`instructions = $${paramIndex++}`);
        params.push(data.instructions);
      }
      if (data.tool_set !== undefined) {
        setClauses.push(`tool_set = $${paramIndex++}`);
        params.push(JSON.stringify(data.tool_set));
      }

      // Add id as the last parameter
      params.push(id);

      const query = `
        UPDATE agents
        SET ${setClauses.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await env.POSTGRES.RUN_SQL({
        query,
        params,
      });

      if (result.rows.length === 0) {
        throw new Error(`Agent with id ${id} not found`);
      }

      return {
        item: transformDbRowToAgent(result.rows[0]),
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
      await ensureTable(env, "agents");

      const { id } = context;

      await env.POSTGRES.RUN_SQL({
        query: "DELETE FROM agents WHERE id = $1",
        params: [id],
      });

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
