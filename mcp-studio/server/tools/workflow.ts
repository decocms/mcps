/** biome-ignore-all lint/suspicious/noExplicitAny: complicated types */
import { createCollectionListOutputSchema } from "@decocms/bindings/collections";
import {
  StepSchema,
  type Workflow,
  WORKFLOW_BINDING,
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

function transformDbRowToWorkflowCollectionItem(row: unknown): Workflow {
  const r = row as Record<string, unknown>;

  // Parse steps - handle both old { phases: [...] } format and new direct array format
  let steps: unknown = [];
  if (r.steps) {
    const parsed = typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps;
    steps = parsed;
  }

  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description !== null ? (r.description as string) : undefined,
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
    description:
      "List workflows with filtering, sorting, and pagination. This does not include the steps of the workflows, use the GET tool to check the list of steps.",
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

      const itemsResult = await runSQL<Record<string, unknown>>(env, sql, [
        ...params,
        limit,
        offset,
      ]);

      const countQuery = `SELECT COUNT(*) as count FROM workflow_collection ${whereClause}`;
      const countResult = await runSQL<{ count: string }>(
        env,
        countQuery,
        params,
      );
      const totalCount = parseInt(countResult[0]?.count || "0", 10);

      return {
        items: itemsResult?.map((item: Record<string, unknown>) => ({
          ...transformDbRowToWorkflowCollectionItem(item),
          steps: [],
        })),
        totalCount,
        hasMore: offset + (itemsResult?.length || 0) < totalCount,
      };
    },
  });

export async function getWorkflowCollection(
  env: Env,
  id: string,
): Promise<Workflow | null> {
  const result = await runSQL<Record<string, unknown>>(
    env,
    "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
    [id],
  );
  return result[0] ? transformDbRowToWorkflowCollectionItem(result[0]) : null;
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

export async function insertWorkflowCollectionItem(
  env: Env,
  workflow: Workflow & { gateway_id: string },
) {
  try {
    await validateWorkflow(workflow, env);
    const stepsJson = JSON.stringify(
      workflow.steps?.map((s) => ({
        ...s,
        name: s.name.trim().replaceAll(/\s+/g, "_"),
      })) || [],
    );

    const result = await runSQL<{ id: string }>(
      env,
      `INSERT INTO workflow_collection (id, title, gateway_id, description, steps, created_at, updated_at, created_by, updated_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        workflow.id,
        workflow.title,
        workflow.gateway_id,
        workflow.description || null,
        stepsJson,
        workflow.created_at,
        workflow.updated_at,
        workflow.created_by,
        workflow.updated_by,
      ],
    );

    if (!result?.length) {
      throw new Error("Failed to create workflow collection item");
    }

    return {
      item: WorkflowSchema.parse(result[0]),
    };
  } catch (error) {
    console.error("Error creating workflow:", error);
    throw error;
  }
}

export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: CREATE_BINDING.name,
    description: `Creates a template/definition for a workflow. This entity is not executable, but can be used to create executions.
    This is ideal for storing and reusing workflows. You may also want to use this tool to iterate on a workflow before creating executions. You may start with an empty array of steps and add steps gradually.

Key concepts:
- Steps run in parallel unless they reference each other's outputs via @ref
- Use @ref syntax to wire data:
    - @input.field - From the execution input
    - @stepName.field - From the output of a step
You can also put many refs inside a single string, for example: "Hello @input.name, your order @input.order_id is ready".
- Execution order is auto-determined from @ref dependencies

Example workflow with 2 parallel steps:
{ "title": "Fetch users and orders", "steps": [
  { "name": "fetch_users", "action": { "toolName": "GET_USERS" } },
  { "name": "fetch_orders", "action": { "toolName": "GET_ORDERS" } },
]}
 
Example workflow with a step that references the output of another step:
{ "title": "Fetch a user by email and then fetch orders", "steps": [
  { "name": "fetch_user", "action": { "toolName": "GET_USER" }, "input": { "email": "@input.user_email" } },
  { "name": "fetch_orders", "action": { "toolName": "GET_USER_ORDERS" }, "input": { "user_id": "@fetch_user.user.id" } },
]}
`,
    inputSchema: z.object({
      data: z.object({
        title: z.string(),
        steps: z
          .array(z.object(StepSchema.omit({ outputSchema: true }).shape))
          .optional(),
        virtual_mcp_id: z
          .string()
          .default("")
          .describe(
            "The gateway ID to use for the workflow execution. The execution will only be able to use tools from this gateway.",
          ),
        description: z
          .string()
          .optional()
          .describe("The description of the workflow"),
      }),
    }),
    // outputSchema: CREATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { data } = context;
      const user = env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
      const workflow: Workflow & { gateway_id: string } = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        steps: data.steps ?? [],
        created_by: user?.id || undefined,
        updated_by: user?.id || undefined,
        gateway_id: data.virtual_mcp_id,
      };
      const { item } = await insertWorkflowCollectionItem(env, workflow);
      const result = WorkflowSchema.parse(item);
      return {
        item: {
          ...result,
          steps: result.steps.map((s) => ({
            ...s,
            outputSchema: undefined,
          })),
        },
      };
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
  if (data.steps && data.steps.length > 0) {
    setClauses.push(`steps = ?`);
    params.push(JSON.stringify(data.steps));
  }

  params.push(id);

  const sql = `
        UPDATE workflow_collection
        SET ${setClauses.join(", ")}
        WHERE id = ?
        RETURNING *
      `;

  const result = await runSQL<Record<string, unknown>>(env, sql, params);

  if (result?.length === 0) {
    throw new Error(`Workflow collection with id ${id} not found`);
  }

  return {
    item: transformDbRowToWorkflowCollectionItem(
      result[0] as Record<string, unknown>,
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
            .describe("The steps of the workflow"),
          gateway_id: z
            .string()
            .optional()
            .describe("The gateway ID to use for the workflow"),
          description: z
            .string()
            .optional()
            .describe("The description of the workflow"),
          updated_by: z
            .string()
            .optional()
            .describe("The updated by user of the workflow"),
        })
        .optional()
        .describe("The data for the workflow"),
    }),
    outputSchema: UPDATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      try {
        const result = await updateWorkflowCollection(env, {
          id: context.id as string,
          data: context.data as Workflow,
        });
        return result;
      } catch (error) {
        console.error("Error updating workflow:", error);
        throw new Error(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  });

export const createAppendStepTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_APPEND_STEP",
    description: "Append a new step to an existing workflow",
    inputSchema: z.object({
      id: z.string().describe("The ID of the workflow to append the step to"),
      step: z
        .object(StepSchema.omit({ outputSchema: true }).shape)
        .describe("The step to append"),
    }),
    outputSchema: z.object({
      success: z
        .boolean()
        .describe("Whether the step was appended successfully"),
    }),
    execute: async ({ context }) => {
      const { id, step } = context;

      const workflow = await getWorkflowCollection(env, id as string);

      if (!workflow) {
        throw new Error(`Workflow with id ${id} not found`);
      }

      await validateWorkflow(
        {
          ...workflow,
          steps: [...workflow.steps, step],
        },
        env,
      );
      await updateWorkflowCollection(env, {
        id,
        data: {
          ...workflow,
          steps: [...workflow.steps, step],
        },
      });
      return {
        success: true,
      };
    },
  });

export const createUpdateStepsTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_WORKFLOW_UPDATE_STEPS",
    description: "Update one or more steps of a workflow",
    inputSchema: z.object({
      steps: z
        .array(
          z.object(StepSchema.omit({ outputSchema: true }).shape).partial(),
        )
        .optional()
        .describe("The steps to update"),
      id: z.string().describe("The ID of the workflow to update"),
    }),
    outputSchema: z.object({
      success: z
        .boolean()
        .describe("Whether the step was updated successfully"),
    }),
    execute: async ({ context }) => {
      const { steps, id } = context;

      if (!steps) {
        throw new Error("No steps provided");
      }

      const workflow = await getWorkflowCollection(env, id as string);

      if (!workflow) {
        throw new Error(`Workflow with id ${id} not found`);
      }

      // Validate that all steps to update exist in the workflow
      for (const step of steps) {
        const existingStep = workflow.steps?.find((s) => s.name === step.name);
        if (!existingStep) {
          throw new Error(`Step with name ${step.name} not found in workflow`);
        }
      }

      // Map over all existing steps, applying updates where names match
      const newSteps = workflow.steps.map((existingStep) => {
        const stepUpdate = steps.find((s) => s.name === existingStep.name);
        if (stepUpdate) {
          return {
            ...existingStep,
            ...stepUpdate,
          };
        }
        return existingStep;
      });

      await validateWorkflow(
        {
          ...workflow,
          steps: newSteps,
        },
        env,
      );
      await updateWorkflowCollection(env, {
        id,
        data: {
          ...workflow,
          steps: newSteps,
        },
      });
      return {
        success: true,
      };
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
        item: transformDbRowToWorkflowCollectionItem(item),
      };
    },
  });

export const workflowCollectionTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createUpdateStepsTool,
  createAppendStepTool,
  createDeleteTool,
];
