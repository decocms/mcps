import { createPrivateTool } from "@decocms/runtime/tools";
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import { Env } from "../main.ts";
import { z } from "zod";
import { validateWorkflow } from "../workflow/validator.ts";
import {
  Workflow,
  WORKFLOWS_BINDING,
  WorkflowSchema,
} from "@decocms/bindings/workflow";
import { buildOrderByClause, buildWhereClause } from "./agent.ts";

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

// Create a relaxed input schema that accepts any string for date fields
// The original binding schema uses z.string().datetime() which is too strict
// We override created_at and updated_at to accept any string since they're server-generated anyway
const originalDataSchema = (
  CREATE_BINDING.inputSchema as unknown as z.ZodObject<any>
).shape.data as z.ZodObject<any>;
const relaxedDataSchema = originalDataSchema.extend({
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
const CREATE_INPUT_SCHEMA = z.object({
  data: relaxedDataSchema,
});
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

  // Parse steps - handle both old { phases: [...] } format and new direct array format
  let steps: unknown = [];
  if (r.steps) {
    const parsed = typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps;
    // Handle legacy { phases: [...] } format
    if (parsed && typeof parsed === "object" && "phases" in parsed) {
      steps = (parsed as { phases: unknown }).phases;
    } else {
      steps = parsed;
    }
  }

  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string | undefined,
    steps: steps as Workflow["steps"],
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
          LIMIT ? OFFSET ?
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

export async function getWorkflow(
  env: Env,
  id: string,
): Promise<Workflow | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: "SELECT * FROM workflows WHERE id = ? LIMIT 1",
    params: [id],
  });
  const item = result.result[0]?.results?.[0] || null;
  return item
    ? transformDbRowToWorkflow(item as Record<string, unknown>)
    : null;
}

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

      const workflow = await getWorkflow(env, id);
      return {
        item: workflow,
      };
    },
  });

export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_INSERT",
    description: "Create a new workflow with validation",
    inputSchema: CREATE_INPUT_SCHEMA,
    outputSchema: CREATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      try {
        const { data } = context;
        const user = await env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
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
                ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
              RETURNING *
            `,
          params: [
            workflow.id,
            workflow.title,
            now,
            now,
            user?.id || null,
            user?.id || null,
            workflow.description || null,
            JSON.stringify(workflow.steps || []),
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
      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
      const now = new Date().toISOString();

      const { id, data } = context;

      const setClauses: string[] = [];
      const params: any[] = [];

      setClauses.push(`updated_at = ?`);
      params.push(now);

      setClauses.push(`updated_by = ?`);
      params.push(user?.id || null);

      if (data.title !== undefined) {
        setClauses.push(`title = ?`);
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push(`description = ?`);
        params.push(data.description);
      }
      if (data.steps !== undefined) {
        setClauses.push(`steps = ?`);
        params.push(JSON.stringify(data.steps || []));
      }
      if (data.triggers !== undefined) {
        setClauses.push(`triggers = ?`);
        params.push(JSON.stringify(data.triggers || []));
      }

      params.push(id);

      const sql = `
          UPDATE workflows
          SET ${setClauses.join(", ")}
          WHERE id = ?
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
        sql: "DELETE FROM workflows WHERE id = ?",
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
