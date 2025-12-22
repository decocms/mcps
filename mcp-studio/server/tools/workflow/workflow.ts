import { createPrivateTool, createTool } from "@decocms/runtime/tools";
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import { Env } from "../../main.ts";
import { z } from "zod";
import { validateWorkflow } from "../../workflow/utils/validator.ts";
import {
  createDefaultWorkflow,
  Workflow,
  WORKFLOW_BINDING,
  WorkflowSchema,
} from "@decocms/bindings/workflow";
import { buildOrderByClause, buildWhereClause } from "../agent.ts";

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

export const createSuggestStepTool = (_env: Env) =>
  createTool({
    id: "COLLECTION_WORKFLOW_SUGGEST_STEP",
    description: "Suggest a step for a workflow",
    inputSchema: z.object({
      purpose: z.string(),
    }),
    outputSchema: z.object({
      step: z.object({
        name: z.string(),
        description: z.string(),
        action: z.object({
          type: z.string(),
          configuration: z.record(z.unknown()),
        }),
        input: z.record(z.unknown()),
      }),
    }),
    execute: async () => {
      return {
        step: {
          name: "suggest_step",
          description: "Suggest a step for a workflow",
          action: {
            type: "tool",
            configuration: {},
          },
          input: {},
        },
      };
    },
  });

export async function insertDefaultWorkflowIfNotExists(env: Env) {
  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: "SELECT * FROM workflows WHERE id = ? LIMIT 1",
      params: [createDefaultWorkflow("default").id],
    });
    if ((result.result[0]?.results as unknown[])?.length > 0) {
      return;
    }
    await insertWorkflow(env, createDefaultWorkflow("default"));
  } catch (error) {
    console.error("Error inserting default workflow:", error);
    throw error;
  }
}

export async function insertWorkflow(env: Env, data?: Workflow) {
  try {
    const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
    const now = new Date().toISOString();

    let workflow: Workflow = {
      ...createDefaultWorkflow(),
      ...data,
    };

    await validateWorkflow(workflow);

    const stepsJson = JSON.stringify(
      workflow.steps.map((s) => ({
        ...s,
        name: s.name.trim().replaceAll(/\s+/g, "_"),
      })) || [],
    );

    const escapeForSql = (val: unknown): string => {
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
      if (typeof val === "number") return String(val);
      return `'${String(val).replace(/'/g, "''")}'`;
    };
    const sql = `INSERT INTO workflows (id, title, created_at, updated_at, created_by, updated_by, description, steps) VALUES (${escapeForSql(
      workflow.id,
    )}, ${escapeForSql(workflow.title)}, ${escapeForSql(now)}, ${escapeForSql(
      now,
    )}, ${escapeForSql(user?.id || null)}, ${escapeForSql(
      user?.id || null,
    )}, ${escapeForSql(workflow.description || null)}, ${escapeForSql(
      stepsJson,
    )})`;

    await env.DATABASE.DATABASES_RUN_SQL({
      sql,
      params: [],
    });

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
    description: "Create a new workflow with validation",
    inputSchema: CREATE_BINDING.inputSchema,
    outputSchema: CREATE_BINDING.outputSchema,
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
      return await insertWorkflow(env, workflow);
    },
  });

async function updateWorkflow(
  env: Env,
  context: { id: string; data: Workflow },
) {
  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().toISOString();

  const { id, data } = context;

  // Get current workflow to check token status
  const currentWorkflow = await getWorkflow(env, id);
  if (!currentWorkflow) {
    throw new Error(`Workflow with id ${id} not found`);
  }

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

  console.log("setClauses", setClauses);
  console.log("params", params);

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
}

export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_UPDATE",
    description: "Update an existing workflow",
    inputSchema: UPDATE_BINDING.inputSchema,
    outputSchema: UPDATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      try {
        return await updateWorkflow(env, {
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
  createSuggestStepTool,
];
