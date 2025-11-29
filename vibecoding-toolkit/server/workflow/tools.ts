/**
 * Workflow Tools
 *
 * MCP tools for phase-based workflow management:
 * - CREATE_WORKFLOW: Create a workflow with validation
 * - EXECUTE_WORKFLOW: Execute a workflow
 * - VALIDATE_WORKFLOW: Validate a workflow definition
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import z from "zod";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { StepSchema, TriggerSchema, type Workflow } from "./schema.ts";
import { validateWorkflow } from "./validator.ts";
import { executeWorkflow } from "./executor.ts";
import { createExecution } from "../lib/execution-db.ts";
import type { QueueMessage } from "../collections/workflow.ts";
import {
  ensureTable,
  buildWhereClause,
  buildOrderByClause,
  ensureCollectionsTables,
} from "../lib/postgres.ts";
import { runFullRecovery } from "../lib/orphan-recovery.ts";
import {
  CollectionDeleteInputSchema,
  CollectionDeleteOutputSchema,
  CollectionGetInputSchema,
  CollectionListInputSchema,
  createCollectionGetOutputSchema,
  createCollectionListOutputSchema,
  createCollectionUpdateInputSchema,
  createCollectionUpdateOutputSchema,
} from "@decocms/bindings/collections";

// ============================================================================
// Database Schema for Workflows
// ============================================================================

const WorkflowDbSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.unknown(), // Stored as JSON
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
});

type WorkflowDb = z.infer<typeof WorkflowDbSchema>;

function transformDbRowToWorkflow(row: unknown): WorkflowDb {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    steps: r.steps
      ? typeof r.steps === "string"
        ? JSON.parse(r.steps)
        : r.steps
      : [],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    created_by: r.created_by as string | undefined,
    updated_by: r.updated_by as string | undefined,
  };
}

// ============================================================================
// CRUD Tools
// ============================================================================

export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_LIST",
    description: "List workflows with filtering, sorting, and pagination",
    inputSchema: CollectionListInputSchema,
    outputSchema: createCollectionListOutputSchema(WorkflowDbSchema),
    execute: async ({ context }) => {
      await ensureCollectionsTables(env);

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
    id: "DECO_COLLECTION_WORKFLOWS_GET",
    description: "Get a single workflow by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(WorkflowDbSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

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
    id: "DECO_COLLECTION_WORKFLOWS_INSERT",
    description: "Create a new workflow with validation",
    inputSchema: z.object({
      data: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        steps: z.array(z.array(StepSchema)),
        triggers: z.array(TriggerSchema).optional(),
      }),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      item: WorkflowDbSchema.optional(),
      errors: z
        .array(
          z.object({
            type: z.string(),
            step: z.string(),
            field: z.string(),
            message: z.string(),
          }),
        )
        .optional(),
    }),
    execute: async ({ context }) => {
      try {
        await ensureTable(env, "workflows");

        const { data } = context;

        // Build workflow object for validation
        const workflow: Workflow = {
          name: data.name,
          description: data.description,
          steps: data.steps,
          triggers: data.triggers,
        };

        // Validate
        const validation = await validateWorkflow(workflow);

        if (!validation.valid) {
          return {
            success: false,
            errors: validation.errors.map((e) => ({
              type: e.type,
              step: e.step,
              field: e.field,
              message: e.message,
            })),
          };
        }

        // Add cached schemas
        if (validation.schemas) {
          workflow._schemas = validation.schemas;
        }

        const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        const result = await env.DATABASE.DATABASES_RUN_SQL({
          sql: `
            INSERT INTO workflows (
              id, name, created_at, updated_at, created_by, updated_by,
              description, steps
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8
            )
            RETURNING *
          `,
          params: [
            id,
            workflow.name,
            now,
            now,
            user?.id || null,
            user?.id || null,
            workflow.description || null,
            JSON.stringify({
              phases: workflow.steps,
              triggers: workflow.triggers,
              _schemas: workflow._schemas,
            }),
          ],
        });

        return {
          success: true,
          item: transformDbRowToWorkflow(
            result.result[0]?.results?.[0] as Record<string, unknown>,
          ),
        };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              type: "internal",
              step: "",
              field: "",
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  });

export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_UPDATE",
    description: "Update an existing workflow",
    inputSchema: createCollectionUpdateInputSchema(
      z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(z.array(StepSchema)).optional(),
        triggers: z.array(TriggerSchema).optional(),
      }),
    ),
    outputSchema: createCollectionUpdateOutputSchema(WorkflowDbSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();

      const { id, data } = context;

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      setClauses.push(`updated_at = $${paramIndex++}`);
      params.push(now);

      setClauses.push(`updated_by = $${paramIndex++}`);
      params.push(user?.id || null);

      if (data.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        params.push(data.name);
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
    id: "DECO_COLLECTION_WORKFLOWS_DELETE",
    description: "Delete a workflow by ID",
    inputSchema: CollectionDeleteInputSchema,
    outputSchema: CollectionDeleteOutputSchema,
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

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

// ============================================================================
// Execution Tools
// ============================================================================

export const executeWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "START_EXECUTION",
    description: "Execute a workflow with durable execution guarantees",
    inputSchema: z.object({
      executionId: z.string().describe("The workflow execution ID to process"),
      retryCount: z
        .number()
        .default(0)
        .describe("Current retry count (managed by queue)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.unknown().optional(),
      error: z.string().optional(),
      shouldRetry: z.boolean().optional(),
      retryDelaySeconds: z.number().optional(),
      triggerResults: z
        .array(
          z.object({
            triggerId: z.string(),
            status: z.enum(["triggered", "skipped", "failed"]),
            executionIds: z.array(z.string()).optional(),
            error: z.string().optional(),
          }),
        )
        .optional(),
    }),
    execute: async ({ context }) => {
      const { executionId, retryCount = 0 } = context;
      return await executeWorkflow(env, executionId, retryCount);
    },
  });

export const validateWorkflowTool = (_env: Env) =>
  createPrivateTool({
    id: "VALIDATE_WORKFLOW",
    description: "Validate a workflow definition without creating it",
    inputSchema: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      steps: z.array(z.array(StepSchema)),
      triggers: z.array(TriggerSchema).optional(),
    }),
    outputSchema: z.object({
      valid: z.boolean(),
      errors: z
        .array(
          z.object({
            type: z.string(),
            step: z.string(),
            field: z.string(),
            message: z.string(),
          }),
        )
        .optional(),
      schemas: z.record(z.record(z.unknown())).optional(),
    }),
    execute: async ({ context }) => {
      const workflow: Workflow = {
        name: context.name,
        description: context.description,
        steps: context.steps,
        triggers: context.triggers,
      };

      const validation = await validateWorkflow(workflow);

      return {
        valid: validation.valid,
        errors:
          validation.errors.length > 0
            ? validation.errors.map((e) => ({
                type: e.type,
                step: e.step,
                field: e.field,
                message: e.message,
              }))
            : undefined,
        schemas: validation.schemas,
      };
    },
  });

export const createAndQueueExecutionTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_AND_QUEUE_EXECUTION",
    description: "Create a workflow execution and queue it for processing",
    inputSchema: z.object({
      workflowId: z.string().describe("The workflow ID to execute"),
      inputs: z
        .record(z.unknown())
        .optional()
        .describe("Input data for the workflow"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      executionId: z.string(),
    }),
    execute: async ({ context }) => {
      console.log("🚀 ~ execute: ~ context:", context);
      const execution = await createExecution(env, {
        workflow_id: context.workflowId,
        status: "pending",
        inputs: context.inputs,
      });
      console.log("🚀 ~ execute: ~ execution:", execution);

      const message: QueueMessage = {
        executionId: execution.id,
        retryCount: 0,
        enqueuedAt: Date.now(),
        authorization: env.DECO_REQUEST_CONTEXT.token,
      };

      await env.WORKFLOW_QUEUE.send(message);

      return { success: true, executionId: execution.id };
    },
  });

export const transformPreviewTool = (_env: Env) =>
  createPrivateTool({
    id: "TRANSFORM_PREVIEW",
    description: "Preview a transform step by executing it with sample input",
    inputSchema: z.object({
      code: z.string().describe("TypeScript transform code"),
      input: z.record(z.unknown()).describe("Sample input data"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.unknown().optional(),
      error: z.string().optional(),
      logs: z.array(z.string()).optional(),
      schemas: z
        .object({
          input: z.record(z.unknown()),
          output: z.record(z.unknown()),
        })
        .optional(),
    }),
    execute: async ({ context }) => {
      const { executeTransform, extractSchemas } = await import(
        "./transform-executor.ts"
      );

      const schemas = extractSchemas(context.code);
      const result = await executeTransform(
        context.code,
        context.input,
        "preview",
      );

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        logs: result.logs,
        schemas,
      };
    },
  });

export const recoverOrphansTool = (env: Env) =>
  createPrivateTool({
    id: "RECOVER_ORPHAN_EXECUTIONS",
    description:
      "Recover orphaned and stuck workflow executions. Finds executions that got stuck due to worker crashes or network issues and re-queues them. Use force=true to recover immediately without waiting for lock expiry (useful for dev/testing when you know all workers are dead).",
    inputSchema: z.object({
      limit: z
        .number()
        .default(100)
        .describe("Maximum number of executions to recover"),
      lockExpiryBufferMs: z
        .number()
        .default(60000)
        .describe("How long a lock must be expired before recovery (ms)"),
      maxAgeMs: z
        .number()
        .default(24 * 60 * 60 * 1000)
        .describe("Maximum age of executions to recover (ms)"),
      force: z
        .boolean()
        .default(false)
        .describe(
          "Force recovery even if locks haven't expired. USE WITH CAUTION: may cause duplicate execution if workers are still running.",
        ),
    }),
    outputSchema: z.object({
      orphans: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
        recoveredIds: z.array(z.string()),
        failedIds: z.array(z.string()),
      }),
      pending: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
        recoveredIds: z.array(z.string()),
        failedIds: z.array(z.string()),
      }),
      total: z.object({
        found: z.number(),
        recovered: z.number(),
        failed: z.number(),
      }),
    }),
    execute: async ({ context }) => {
      const result = await runFullRecovery(
        env,
        {
          limit: context.limit,
          lockExpiryBufferMs: context.lockExpiryBufferMs,
          maxAgeMs: context.maxAgeMs,
          force: context.force,
          verbose: true,
        },
        env.DECO_REQUEST_CONTEXT.token,
      );
      return result;
    },
  });

// ============================================================================
// Export
// ============================================================================

export const workflowTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
  executeWorkflowTool,
  validateWorkflowTool,
  createAndQueueExecutionTool,
  transformPreviewTool,
  recoverOrphansTool,
];
