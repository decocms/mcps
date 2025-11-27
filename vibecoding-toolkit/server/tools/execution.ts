import {
  ExecutionStepResultSchema,
  WorkflowExecutionSchema,
} from "../collections/workflow";
import z from "zod";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  CollectionGetInputSchema,
  CollectionListInputSchema,
  createCollectionGetOutputSchema,
  createCollectionInsertInputSchema,
  createCollectionInsertOutputSchema,
  createCollectionListOutputSchema,
  createCollectionUpdateInputSchema,
  createCollectionUpdateOutputSchema,
} from "@decocms/bindings/collections";
import {
  buildOrderByClause,
  buildWhereClause,
  ensureTable,
} from "../lib/postgres.ts";

/**
 * Transform database row to match WorkflowSchema
 */
function transformDbRowToWorkflowExecution(
  row = {} as unknown as Record<string, unknown>,
): z.infer<typeof WorkflowExecutionSchema> {
  const rowCopy: z.infer<typeof WorkflowExecutionSchema> = {
    ...(row as Record<string, unknown>),
    output: row.output ? JSON.parse(row.output as string) : undefined,
    workflow_id: row.workflow_id as string,
    id: row.id as string,
    status: row.status as "pending" | "running" | "completed" | "failed",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: row.created_by ? (row.created_by as string) : undefined,
    updated_by: row.updated_by ? (row.updated_by as string) : undefined,
    inputs: row.inputs ? JSON.parse(row.inputs as string) : undefined,
    started_at_epoch_ms: row.started_at_epoch_ms as number,
  };

  const guardContract = WorkflowExecutionSchema;
  const guardResult = guardContract.safeParse(rowCopy);
  if (!guardResult.success) {
    throw new Error(`Invalid workflow execution: ${guardResult.error.message}`);
  }
  return guardResult.data;
}

/**
 * LIST Tool - Query workflow_executions with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOW_EXECUTIONS_LIST",
    description:
      "List workflow_executions with filtering, sorting, and pagination",
    inputSchema: CollectionListInputSchema,
    outputSchema: createCollectionListOutputSchema(WorkflowExecutionSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflow_executions");

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
          SELECT * FROM workflow_executions
          ${whereClause}
          ${orderByClause}
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

      const itemsResult = await env.DATABASE.DATABASES_RUN_SQL({
        sql: query,
        params: [...params, limit, offset],
      });

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM workflow_executions ${whereClause}`;
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
        items:
          itemsResult.result[0]?.results?.map((item: any) =>
            transformDbRowToWorkflowExecution(item),
          ) || [],
        totalCount,
        hasMore:
          offset + (itemsResult.result[0]?.results?.length || 0) < totalCount,
      };
    },
  });

/**
 * GET Tool - Fetch a single execution by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOW_EXECUTIONS_GET",
    description: "Get a single execution by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(WorkflowExecutionSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflow_executions");

      const { id } = context;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: "SELECT * FROM workflow_executions WHERE id = $1 LIMIT 1",
        params: [id],
      });

      const item = result.result[0]?.results?.[0] as Record<
        string,
        unknown
      > | null;

      return {
        item: item ? transformDbRowToWorkflowExecution(item) : null,
      };
    },
  });

/**
 * INSERT Tool - Create a new execution
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOW_EXECUTIONS_INSERT",
    description: "Create a new execution",
    inputSchema: createCollectionInsertInputSchema(WorkflowExecutionSchema),
    outputSchema: createCollectionInsertOutputSchema(WorkflowExecutionSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflow_executions");

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const { data } = context;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
            INSERT INTO workflow_executions (
              id, workflow_id, status, created_at, updated_at, created_by, updated_by,
              inputs
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, 
              $8
            )
            RETURNING *
          `,
        params: [
          id,
          data.workflow_id,
          data.status,
          now,
          now,
          user?.id || null,
          user?.id || null,
          JSON.stringify(data.inputs || {}),
        ],
      });

      return {
        item: transformDbRowToWorkflowExecution(
          result.result[0]?.results?.[0] as Record<string, unknown>,
        ),
      };
    },
  });

/**
 * UPDATE Tool - Update an existing execution
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE",
    description: "Update an existing execution",
    inputSchema: createCollectionUpdateInputSchema(WorkflowExecutionSchema),
    outputSchema: createCollectionUpdateOutputSchema(WorkflowExecutionSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflow_executions");

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
      if (data.workflow_id !== undefined) {
        setClauses.push(`workflow_id = $${paramIndex++}`);
        params.push(data.workflow_id);
      }
      if (data.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        params.push(data.status);
      }
      if (data.output !== undefined) {
        setClauses.push(`output = $${paramIndex++}`);
        params.push(JSON.stringify(data.output));
      }
      if (data.error !== undefined) {
        setClauses.push(`error = $${paramIndex++}`);
        params.push(data.error);
      }
      if (data.recovery_attempts !== undefined) {
        setClauses.push(`recovery_attempts = $${paramIndex++}`);
        params.push(data.recovery_attempts);
      }
      if (data.workflow_timeout_ms !== undefined) {
        setClauses.push(`workflow_timeout_ms = $${paramIndex++}`);
        params.push(data.workflow_timeout_ms);
      }
      if (data.workflow_deadline_epoch_ms !== undefined) {
        setClauses.push(`workflow_deadline_epoch_ms = $${paramIndex++}`);
        params.push(data.workflow_deadline_epoch_ms);
      }
      if (data.inputs !== undefined) {
        setClauses.push(`inputs = $${paramIndex++}`);
        params.push(JSON.stringify(data.inputs));
      }
      if (data.started_at_epoch_ms !== undefined) {
        setClauses.push(`started_at_epoch_ms = $${paramIndex++}`);
        params.push(data.started_at_epoch_ms);
      }

      // Add id as the last parameter
      params.push(id);

      const query = `
          UPDATE workflow_executions
          SET ${setClauses.join(", ")}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: query,
        params,
      });

      if (result.result[0]?.results?.length === 0) {
        throw new Error(`Workflow execution with id ${id} not found`);
      }

      return {
        item: transformDbRowToWorkflowExecution(
          result.result[0]?.results?.[0] as Record<string, unknown>,
        ),
      };
    },
  });

export const createInsertExecutionStepResultTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_EXECUTION_STEP_RESULTS_INSERT",
    description: "Create a new execution step result",
    inputSchema: createCollectionInsertInputSchema(ExecutionStepResultSchema),
    outputSchema: createCollectionInsertOutputSchema(ExecutionStepResultSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "execution_step_results");

      console.log({ stepResultContext: context });

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          INSERT INTO execution_step_results
          (execution_id, step_id, child_workflow_id, started_at_epoch_ms)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING RETURNING started_at_epoch_ms;
        `,
        params: [
          context.data.execution_id,
          context.data.step_id,
          context.data.child_workflow_id,
          context.data.started_at_epoch_ms,
        ],
      });

      return {
        item: result.result[0]?.results?.[0] as z.infer<
          typeof ExecutionStepResultSchema
        >,
      };
    },
  });

export const createUpdateExecutionStepResultTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_EXECUTION_STEP_RESULTS_UPDATE",
    description: "Update an existing execution step result",
    inputSchema: createCollectionUpdateInputSchema(
      ExecutionStepResultSchema,
    ).omit({ id: true }),
    outputSchema: createCollectionUpdateOutputSchema(ExecutionStepResultSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "execution_step_results");

      console.log({ context });

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
            UPDATE execution_step_results
            SET output = $1, error = $2, child_workflow_id = $3, completed_at_epoch_ms = $4
            WHERE execution_id = $6 AND step_id = $7
            RETURNING *
          `,
        params: [
          JSON.stringify(context.data.output),
          context.data.error || undefined,
          context.data.child_workflow_id || undefined,
          context.data.completed_at_epoch_ms || undefined,
          context.data.execution_id,
          context.data.step_id,
        ],
      });

      return {
        item: result.result[0]?.results?.[0] as z.infer<
          typeof ExecutionStepResultSchema
        >,
      };
    },
  });

async function getAllExecutionStepResults(
  env: Env,
  executionID: string,
): Promise<z.infer<typeof ExecutionStepResultSchema>[]> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = $1`,
    params: [executionID],
  });

  const items =
    result.result[0]?.results?.map((item: unknown) => {
      const itemData = item as Record<string, unknown> | undefined;
      console.log({ itemData });
      const output = itemData?.output
        ? JSON.parse(itemData?.output as string)
        : {};
      return ExecutionStepResultSchema.parse({
        ...itemData,
        output,
      });
    }) || [];

  console.log({ items });
  return items;
}

async function getExecutionStepResult(
  env: Env,
  executionID: string,
  stepID: string,
): Promise<z.infer<typeof ExecutionStepResultSchema> | null> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT * FROM execution_step_results WHERE execution_id = $1 AND step_id = $2`,
    params: [executionID, stepID],
  });
  return result.result[0]?.results?.[0] as z.infer<
    typeof ExecutionStepResultSchema
  > | null;
}

export const createGetExecutionStepResultTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_EXECUTION_STEP_RESULTS_GET",
    description: "Get an execution step result by execution and step IDs",
    inputSchema: CollectionGetInputSchema.extend({
      step_id: z.string(),
    }),
    outputSchema: createCollectionGetOutputSchema(ExecutionStepResultSchema),
    execute: async ({ context }) => {
      const item = await getExecutionStepResult(
        env,
        context.id,
        context.step_id,
      );
      return {
        item: item ? ExecutionStepResultSchema.parse(item) : null,
      };
    },
  });

export const createGetAllExecutionStepResultsTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_EXECUTION_STEP_RESULTS_GET_ALL",
    description: "Get all execution step results for an execution",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionListOutputSchema(ExecutionStepResultSchema),
    execute: async ({ context }) => {
      const items = await getAllExecutionStepResults(env, context.id);
      return {
        items: items,
        totalCount: items.length,
        hasMore: false,
      };
    },
  });

// Export all tools as an array
export const workflowExecutionTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createInsertExecutionStepResultTool,
  createUpdateExecutionStepResultTool,
  createGetAllExecutionStepResultsTool,
  createGetExecutionStepResultTool,
];
