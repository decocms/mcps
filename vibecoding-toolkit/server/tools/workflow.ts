// ============================================================================
// CRUD Tools
// ============================================================================

import { createPrivateTool } from "@decocms/runtime/mastra";
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import { Env } from "../main.ts";
import {
  buildOrderByClause,
  buildWhereClause,
  ensureCollectionsTables,
} from "../lib/postgres.ts";
import { z } from "zod";
import { validateWorkflow } from "../workflow/validator.ts";
import {
  Workflow,
  WORKFLOWS_BINDING,
  WorkflowSchema,
} from "@decocms/bindings/workflow";

const LIST_BINDING = WORKFLOWS_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_LIST",
);
const GET_BINDING = WORKFLOWS_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_GET",
);
const CREATE_BINDING = WORKFLOWS_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_CREATE",
);
const UPDATE_BINDING = WORKFLOWS_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_UPDATE",
);
const DELETE_BINDING = WORKFLOWS_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_DELETE",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_LIST binding not found or missing schemas",
  );
}
if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_GET binding not found or missing schemas",
  );
}
if (!CREATE_BINDING?.inputSchema || !CREATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_CREATE binding not found or missing schemas",
  );
}
if (!UPDATE_BINDING?.inputSchema || !UPDATE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_UPDATE binding not found or missing schemas",
  );
}
if (!DELETE_BINDING?.inputSchema || !DELETE_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_WORKFLOW_DELETE binding not found or missing schemas",
  );
}

function transformDbRowToWorkflow(row: unknown): Workflow {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string | undefined,
    steps: r.steps
      ? typeof r.steps === "string"
        ? JSON.parse(r.steps)
        : r.steps
      : [],
    triggers: r.triggers
      ? typeof r.triggers === "string"
        ? JSON.parse(r.triggers)
        : r.triggers
      : [],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    created_by: r.created_by as string | undefined,
    updated_by: r.updated_by as string | undefined,
  };
}

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_LIST",
    description: "List workflows with filtering, sorting, and pagination",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: createCollectionListOutputSchema(WorkflowSchema),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_BINDING.inputSchema>;
    }) => {
      try {
        await ensureCollectionsTables(env);
      } catch (error) {
        console.error("Error ensuring collections tables:", error);
        throw error;
      }
      const { where, orderBy, limit = 50, offset = 0 } = context;

      let whereClause = "";
      let params: any[] = [];
      if (where) {
        const result = buildWhereClause(where, params);
        whereClause = result.clause ? `WHERE ${result.clause}` : "";
        params = result.params;
      }

      const orderByClause = buildOrderByClause(orderBy);

      const sql = `
          SELECT * FROM workflows
          ${whereClause}
          ${orderByClause}
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

      const itemsResult: any = await env.DATABASE.DATABASES_RUN_SQL({
        sql,
        params: [...params, limit, offset],
      });

      const countQuery = `SELECT COUNT(*) as count FROM workflows ${whereClause}`;
      const countResult = await env.DATABASE.DATABASES_RUN_SQL({
        sql: countQuery,
        params,
      });
      const totalCount = parseInt(
        (countResult.result[0]?.results?.[0] as { count: string })?.count ||
          "0",
        10,
      );

      return {
        items: itemsResult.result[0]?.results?.map(
          (item: Record<string, unknown>) => transformDbRowToWorkflow(item),
        ),
        totalCount,
        hasMore:
          offset + (itemsResult.result[0]?.results?.length || 0) < totalCount,
      };
    },
  });

export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_GET",
    description: "Get a single agent by ID",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: "SELECT * FROM workflows WHERE id = $1 LIMIT 1",
        params: [id] as any[],
      });

      const item = result.result[0]?.results?.[0] || null;

      return {
        item: item
          ? transformDbRowToWorkflow(item as Record<string, unknown>)
          : null,
      };
    },
  });

export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_INSERT",
    description: "Create a new workflow with validation",
    inputSchema: CREATE_BINDING.inputSchema,
    outputSchema: CREATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      try {
        const { data } = context;
        const user = await env.SELF.GET_USER({});
        const now = new Date().toISOString();

        // Build workflow object for validation
        const workflow: Workflow = {
          id: crypto.randomUUID(),
          title: data.title,
          description: data.description,
          steps: data.steps,
          triggers: data.triggers,
          created_at: now,
          updated_at: now,
          created_by: user?.id || undefined,
          updated_by: user?.id || undefined,
        };

        // Validate
        const validation = await validateWorkflow(workflow);

        if (!validation.valid) {
          throw new Error("Invalid workflow");
        }

        const result = await env.DATABASE.DATABASES_RUN_SQL({
          sql: `
              INSERT INTO workflows (
                id, title, created_at, updated_at, created_by, updated_by,
                description, steps, triggers
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
              )
              RETURNING *
            `,
          params: [
            workflow.id,
            workflow.title,
            now,
            now,
            user?.id || undefined,
            user?.id || undefined,
            workflow.description || undefined,
            JSON.stringify({
              phases: workflow.steps,
            }) || "{}",
            JSON.stringify(workflow.triggers || []) || "{}",
          ],
        });

        const item = result.result[0]?.results?.[0] as Record<string, unknown>;

        return {
          item: transformDbRowToWorkflow(item),
        };
      } catch (error) {
        console.error("Error creating workflow:", error);
        throw error;
      }
    },
  });
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_UPDATE",
    description: "Update an existing workflow",
    inputSchema: UPDATE_BINDING.inputSchema,
    outputSchema: UPDATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const user = await env.SELF.GET_USER({});
      const now = new Date().toISOString();

      const { id, data } = context;

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      setClauses.push(`updated_at = $${paramIndex++}`);
      params.push(now);

      setClauses.push(`updated_by = $${paramIndex++}`);
      params.push(user?.id || undefined);

      if (data.title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.steps !== undefined) {
        setClauses.push(`steps = $${paramIndex++}`);
        params.push(
          JSON.stringify({
            phases: data.steps,
            triggers: data.triggers,
          }),
        );
      }

      params.push(id);

      const sql = `
          UPDATE workflows
          SET ${setClauses.join(", ")}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql,
        params,
      });

      if (result.result[0]?.results?.length === 0) {
        throw new Error(`Workflow with id ${id} not found`);
      }

      return {
        item: transformDbRowToWorkflow(
          result.result[0]?.results?.[0] as Record<string, unknown>,
        ),
      };
    },
  });

export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_DELETE",
    description: "Delete a workflow by ID",
    inputSchema: DELETE_BINDING.inputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      id: z.string(),
    }),
    execute: async ({ context }) => {
      const { id } = context;

      await env.DATABASE.DATABASES_RUN_SQL({
        sql: "DELETE FROM workflows WHERE id = $1",
        params: [id],
      });

      return {
        success: true,
        id,
      };
    },
  });

export const workflowCollectionTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
];
