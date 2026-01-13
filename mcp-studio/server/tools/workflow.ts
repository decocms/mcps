/** biome-ignore-all lint/suspicious/noExplicitAny: complicated types */
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import {
  createDefaultWorkflow,
  WORKFLOW_BINDING,
  type Workflow,
  WorkflowSchema,
  StepSchema,
} from "@decocms/bindings/workflow";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";
import { validateWorkflow } from "../utils/validator.ts";
import { buildOrderByClause, buildWhereClause } from "./_helpers.ts";
import {
  getFileWorkflows,
  getFileWorkflow,
  isFileWorkflow,
  type FileWorkflow,
} from "../db/file-workflows.ts";

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

/** Extended workflow with readonly flag */
interface WorkflowWithMeta extends Workflow {
  readonly?: boolean;
  source_file?: string;
}

function transformDbRowToWorkflowCollectionItem(
  row: unknown,
): WorkflowWithMeta {
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
    readonly: false, // DB workflows are editable
  };
}

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_LIST",
    description:
      "List workflows with filtering, sorting, and pagination. Includes file-based workflows (readonly) from WORKFLOWS_DIRS.",
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
        await env.MESH_REQUEST_CONTEXT?.state?.DATABASE?.DATABASES_RUN_SQL({
          sql,
          params: [...params, limit, offset],
        });

      if (!itemsResult?.result?.[0]?.results) {
        throw new Error("Database query failed or returned invalid result");
      }

      const countQuery = `SELECT COUNT(*) as count FROM workflow_collection ${whereClause}`;
      const countResult =
        await env.MESH_REQUEST_CONTEXT?.state?.DATABASE?.DATABASES_RUN_SQL({
          sql: countQuery,
          params,
        });
      const dbTotalCount = parseInt(
        (countResult?.result?.[0]?.results?.[0] as { count: string })?.count ||
          "0",
        10,
      );

      // Get DB workflows
      const dbWorkflows: WorkflowWithMeta[] = itemsResult.result[0].results.map(
        (item: Record<string, unknown>) =>
          transformDbRowToWorkflowCollectionItem(item),
      );

      // Get file-based workflows (always included, marked readonly)
      const fileWorkflows = getFileWorkflows();

      // Get IDs of DB workflows to avoid duplicates
      const dbIds = new Set(dbWorkflows.map((w) => w.id));

      // Filter file workflows to exclude those with same ID as DB (DB takes precedence)
      const uniqueFileWorkflows = fileWorkflows.filter(
        (fw) => !dbIds.has(fw.id),
      );

      // Merge: DB workflows first, then file workflows
      const allWorkflows = [...dbWorkflows, ...uniqueFileWorkflows];
      const totalCount = dbTotalCount + uniqueFileWorkflows.length;

      return {
        items: allWorkflows,
        totalCount,
        hasMore: offset + dbWorkflows.length < dbTotalCount,
      };
    },
  });

export async function getWorkflowCollection(
  env: Env,
  id: string,
): Promise<WorkflowWithMeta | null> {
  // First check DB
  const result =
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE?.DATABASES_RUN_SQL({
      sql: "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
      params: [id],
    });
  const item = result?.result?.[0]?.results?.[0] || null;

  if (item) {
    return transformDbRowToWorkflowCollectionItem(
      item as Record<string, unknown>,
    );
  }

  // Fall back to file-based workflows
  const fileWorkflow = getFileWorkflow(id);
  if (fileWorkflow) {
    return fileWorkflow as WorkflowWithMeta;
  }

  return null;
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
  { "name": "fetch_users", "action": { "toolName": "GET_USERS" }, "input": { "all": true }, "transformCode": "export default async (i) => i[0]" },
  { "name": "fetch_orders", "action": { "toolName": "GET_ORDERS" }, "input": { "user": "@fetch_users.user" } },
]}
`,
    inputSchema: z.object({
      data: z
        .object({
          title: z.string().optional().describe("The title of the workflow"),
          steps: z
            .array(z.object(StepSchema.omit({ outputSchema: true }).shape))
            .optional()
            .describe(
              "The steps to execute - need to provide this or the workflow_collection_id",
            ),
          input: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("The input to the workflow"),
          gateway_id: z
            .string()
            .optional()
            .describe("The gateway ID to use for the workflow"),
          description: z
            .string()
            .optional()
            .describe("The description of the workflow"),
          created_by: z
            .string()
            .optional()
            .describe("The created by user of the workflow"),
        })
        .optional()
        .describe("The data for the workflow"),
    }),
    outputSchema: z
      .object({})
      .catchall(z.unknown())
      .describe("The ID of the created workflow"),
    execute: async ({ context }) => {
      const { data } = context;
      const workflow = {
        id: crypto.randomUUID(),
        title: data?.title ?? `Workflow ${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        steps: data?.steps ?? [],
        ...data,
      };
      return await insertWorkflowCollection(env, workflow);
    },
  });

async function updateWorkflowCollection(
  env: Env,
  context: { id: string; data: Workflow },
) {
  const { id, data } = context;

  // Check if this is a file-based workflow (readonly)
  if (isFileWorkflow(id)) {
    throw new Error(
      `Cannot update workflow "${id}" - it is a file-based workflow (readonly). Use COLLECTION_WORKFLOW_DUPLICATE to create an editable copy.`,
    );
  }

  const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
  const now = new Date().toISOString();
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
        UPDATE workflow_collection
        SET ${setClauses.join(", ")}
        WHERE id = ?
        RETURNING *
      `;

  const result =
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE?.DATABASES_RUN_SQL({
      sql,
      params,
    });

  if (!result?.result?.[0]?.results || result.result[0].results.length === 0) {
    throw new Error(`Workflow collection with id ${id} not found`);
  }

  return {
    item: transformDbRowToWorkflowCollectionItem(
      result.result[0].results[0] as Record<string, unknown>,
    ),
  };
}

export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_UPDATE",
    description: "Update an existing workflow",
    inputSchema: z.object({
      id: z.string().describe("The ID of the workflow to update"),
      data: z
        .object({
          title: z.string().optional().describe("The title of the workflow"),
          steps: z
            .array(z.object(StepSchema.omit({ outputSchema: true }).shape))
            .optional()
            .describe(
              "The steps to execute - need to provide this or the workflow_collection_id",
            ),
          input: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("The input to the workflow"),
          gateway_id: z
            .string()
            .optional()
            .describe("The gateway ID to use for the workflow"),
          description: z
            .string()
            .optional()
            .describe("The description of the workflow"),
          created_by: z
            .string()
            .optional()
            .describe("The created by user of the workflow"),
        })
        .optional()
        .describe("The data for the workflow"),
    }),
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
    description:
      "Delete a workflow by ID. Cannot delete file-based workflows (readonly).",
    inputSchema: DELETE_BINDING.inputSchema,
    outputSchema: DELETE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { id } = context;

      // Check if this is a file-based workflow (readonly)
      if (isFileWorkflow(id)) {
        throw new Error(
          `Cannot delete workflow "${id}" - it is a file-based workflow (readonly). Remove the JSON file from the WORKFLOWS_DIRS directory to delete it.`,
        );
      }

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
        item: transformDbRowToWorkflowCollectionItem(item),
      };
    },
  });

export const createDuplicateTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_DUPLICATE",
    description:
      "Duplicate a workflow (file-based or DB) to create an editable copy in PostgreSQL. Use this to customize file-based workflows.",
    inputSchema: z.object({
      id: z.string().describe("The ID of the workflow to duplicate"),
      new_id: z
        .string()
        .optional()
        .describe("Optional new ID for the duplicate. Defaults to id-copy."),
      new_title: z
        .string()
        .optional()
        .describe(
          "Optional new title for the duplicate. Defaults to original title + (Copy).",
        ),
    }),
    outputSchema: z.object({
      item: WorkflowSchema,
    }),
    execute: async ({ context }) => {
      const { id, new_id, new_title } = context;

      // Get the source workflow (from DB or file)
      const sourceWorkflow = await getWorkflowCollection(env, id);
      if (!sourceWorkflow) {
        throw new Error(`Workflow "${id}" not found`);
      }

      // Create a copy with new ID
      const copyId = new_id || `${id}-copy`;
      const copyTitle = new_title || `${sourceWorkflow.title} (Copy)`;

      // Check if the new ID already exists in DB
      const existingResult =
        await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
          sql: "SELECT id FROM workflow_collection WHERE id = ? LIMIT 1",
          params: [copyId],
        });

      if (existingResult.result[0]?.results?.length > 0) {
        throw new Error(`Workflow with ID "${copyId}" already exists`);
      }

      // Create the duplicate
      const duplicateWorkflow: Workflow = {
        id: copyId,
        title: copyTitle,
        description: sourceWorkflow.description,
        steps: sourceWorkflow.steps,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return await insertWorkflowCollection(env, duplicateWorkflow);
    },
  });

export const workflowCollectionTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
  createDuplicateTool,
];
