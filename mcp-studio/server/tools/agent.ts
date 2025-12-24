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
import type { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";
import {
  buildWhereClause,
  buildOrderByClause,
  type WhereExpression,
  type OrderByExpression,
} from "./_helpers.ts";

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
      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { data } = context;

      const id = data.id ?? crypto.randomUUID();

      await runSQL(
        env,
        `
				INSERT INTO agents (
					id, title, created_at, updated_at, created_by, updated_by,
					description, instructions, tool_set, avatar
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
          data.instructions ?? "",
          JSON.stringify(data.tool_set || {}),
          data.avatar ??
            "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png",
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
          updated_by: updatedItem.updated_by || "unknown",
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
    outputSchema: DELETE_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof DELETE_BINDING.inputSchema>;
    }) => {
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
          ...agent,
          tool_set: agent.tool_set || {},
        } as z.infer<typeof AgentSchema>,
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
