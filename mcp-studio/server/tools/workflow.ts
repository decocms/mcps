/** biome-ignore-all lint/suspicious/noExplicitAny: complicated types */
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import {
  createDefaultWorkflow,
  WORKFLOW_BINDING,
  type Workflow,
  WorkflowSchema,
} from "@decocms/bindings/workflow";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";
import { validateWorkflow } from "../utils/validator.ts";
import { buildOrderByClause, buildWhereClause } from "./_helpers.ts";

const LIST_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_LIST",
);
const GET_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_GET",
);
const CREATE_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_CREATE",
);
const UPDATE_BINDING = WORKFLOW_BINDING.find(
  (b) => b.name === "COLLECTION_WORKFLOW_UPDATE",
);
const DELETE_BINDING = WORKFLOW_BINDING.find(
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
          SELECT * FROM workflow_collection
          ${whereClause}
          ${orderByClause}
          LIMIT ? OFFSET ?
        `;

      const itemsResult: any =
        await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
          sql,
          params: [...params, limit, offset],
        });

      const countQuery = `SELECT COUNT(*) as count FROM workflow_collection ${whereClause}`;
      const countResult =
        await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
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

export async function getWorkflowCollection(
  env: Env,
  id: string,
): Promise<Workflow | null> {
  const result =
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
      sql: "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
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
    description: "Get a single workflow by ID",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;

      const workflow = await getWorkflowCollection(env, id);
      return {
        item: workflow,
      };
    },
  });

export async function insertWorkflowCollection(env: Env, data?: Workflow) {
  try {
    const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
    const now = new Date().toISOString();

    const workflow: Workflow = {
      ...createDefaultWorkflow(),
      ...data,
    };
    await validateWorkflow(workflow, env);

    const stepsJson = JSON.stringify(
      workflow.steps.map((s) => ({
        ...s,
        name: s.name.trim().replaceAll(/\s+/g, "_"),
      })) || [],
    );

    // Note: gateway_id should come from workflow data, not hard-coded
    const gatewayId = (workflow as any).gateway_id ?? "";

    const result = await runSQL<Record<string, unknown>>(
      env,
      `INSERT INTO workflow_collection (id, title, input, gateway_id, description, steps, created_at, updated_at, created_by, updated_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        workflow.id,
        workflow.title,
        JSON.stringify((workflow as any).input ?? null),
        gatewayId,
        workflow.description || null,
        stepsJson,
        now,
        now,
        user?.id || null,
        user?.id || null,
      ],
    );

    if (!result.length) {
      throw new Error("Failed to create workflow collection");
    }

    return {
      item: workflow,
    };
  } catch (error) {
    console.error("Error creating workflow:", error);
    throw error;
  }
}

export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: CREATE_BINDING.name,
    description: `Create a workflow: a sequence of steps that execute automatically with data flowing between them.

Key concepts:
- Steps run in parallel unless they reference each other's outputs via @ref
- Use @ref syntax to wire data: @input.field, @stepName.field, @item (in loops)
- Execution order is auto-determined from @ref dependencies

Example workflow with 2 parallel steps:
{ "title": "Fetch users and orders", "steps": [
  { "name": "fetch_users", "action": { "toolName": "GET_USERS" } },
  { "name": "fetch_orders", "action": { "toolName": "GET_ORDERS" } },
]}

Example workflow with a step that references the output of another step:
{ "title": "Get first user and then fetch orders", "steps": [
  true }, "transformCode": "export default async (i) => i[0]" },
  { "name": "fetch_orders", "action": { "toolName": "GET_ORDERS" }, "input": { "user": "@fetch_users.user" } },
]}
`,
    inputSchema: CREATE_BINDING.inputSchema,
    outputSchema: z
      .object({})
      .catchall(z.unknown())
      .describe("The ID of the created workflow"),
    execute: async ({
      context,
    }: {
      context: z.infer<typeof CREATE_BINDING.inputSchema>;
    }) => {
      const { data } = context;
      const workflow = {
        ...createDefaultWorkflow(),
        ...data,
      };
      return await insertWorkflowCollection(env, workflow);
    },
  });

async function updateWorkflowCollection(
  env: Env,
  context: { id: string; data: Workflow },
) {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().toISOString();

  const { id, data } = context;

  await validateWorkflow(data, env);

  const setClauses: string[] = [];
  const params: unknown[] = [];

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

  params.push(id);

  const sql = `
y        UPDATE workflow_collection
        SET ${setClauses.join(", ")}
        WHERE id = ?
        RETURNING *
      `;

  const result =
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
      sql,
      params,
    });

  if (result.result[0]?.results?.length === 0) {
    throw new Error(`Workflow collection with id ${id} not found`);
  }

  return {
    item: transformDbRowToWorkflow(
      result.result[0]?.results?.[0] as Record<string, unknown>,
    ),
  };
}

export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_UPDATE",
    description: "Update an existing workflow",
    inputSchema: UPDATE_BINDING.inputSchema,
    outputSchema: UPDATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      try {
        return await updateWorkflowCollection(env, {
          id: context.id as string,
          data: context.data as Workflow,
        });
      } catch (error) {
        console.error("Error updating workflow:", error);
        throw new Error(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  });

export const createDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_DELETE",
    description: "Delete a workflow by ID",
    inputSchema: DELETE_BINDING.inputSchema,
    outputSchema: DELETE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { id } = context;

      const result = await runSQL<Record<string, unknown>>(
        env,
        "DELETE FROM workflow_collection WHERE id = ? RETURNING *",
        [id],
      );

      const item = result[0];
      if (!item) {
        throw new Error(`Workflow collection with id ${id} not found`);
      }
      return {
        item: transformDbRowToWorkflow(item),
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
