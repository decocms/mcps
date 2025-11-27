import z from "zod";
import { callFunction, inspect } from "@deco/cf-sandbox";
import { evalCodeAndReturnDefaultHandle, validate } from "./utils.ts";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { Step, StepSchema } from "../workflow-runner/index.ts";

/**
 * Workflows Collection Tools
 *
 * Implements the 5 standard collection operations for workflows:
 * - LIST: Query workflows with filtering, sorting, and pagination
 * - GET: Fetch a single workflow by ID
 * - INSERT: Create a new workflow
 * - UPDATE: Update an existing workflow
 * - DELETE: Delete a workflow
 */

import { ensureTable } from "../lib/postgres.ts";
import {
  CollectionDeleteInputSchema,
  CollectionDeleteOutputSchema,
  CollectionGetInputSchema,
  CollectionListInputSchema,
  createCollectionGetOutputSchema,
  createCollectionInsertInputSchema,
  createCollectionInsertOutputSchema,
  createCollectionListOutputSchema,
  createCollectionUpdateInputSchema,
  createCollectionUpdateOutputSchema,
} from "@decocms/bindings/collections";
import { buildOrderByClause, buildWhereClause } from "../lib/postgres.ts";
import { WorkflowSchema } from "../collections/workflow.ts";

/**
 * Transform database row to match WorkflowSchema
 */
function transformDbRowToWorkflow(
  row: unknown,
): z.infer<typeof WorkflowSchema> {
  // Parse steps and transform to correct structure
  let steps: Step[] = [];
  if ((row as Record<string, unknown>).steps) {
    const parsedSteps = JSON.parse(
      (row as Record<string, unknown>).steps as string,
    );
    const guardContract = z.array(StepSchema);
    const guardResult = guardContract.safeParse(parsedSteps);
    if (!guardResult.success) {
      throw new Error(`Invalid steps: ${guardResult.error.message}`);
    }
    steps = guardResult.data;
  }

  return { ...(row as z.infer<typeof WorkflowSchema>), steps };
}

/**
 * LIST Tool - Query workflows with filtering, sorting, and pagination
 */
export const createListTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_LIST",
    description: "List workflows with filtering, sorting, and pagination",
    inputSchema: CollectionListInputSchema,
    outputSchema: createCollectionListOutputSchema(WorkflowSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

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

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM workflows ${whereClause}`;
      const countResult = await env.DATABASE.DATABASES_RUN_SQL({
        sql: countQuery,
        params,
      });
      const totalCount = parseInt(
        (
          countResult.result[0]?.results?.[0] as {
            count: string;
          }
        )?.count || "0",
        10,
      );

      return {
        items: itemsResult.result[0]?.results?.map(
          (item: Record<string, unknown>) => transformDbRowToWorkflow(item),
        ),
        totalCount,
        hasMore: offset + itemsResult.rows.length < totalCount,
      };
    },
  });

/**
 * GET Tool - Fetch a single workflow by ID
 */
export const createGetTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_GET",
    description: "Get a single workflow by ID",
    inputSchema: CollectionGetInputSchema,
    outputSchema: createCollectionGetOutputSchema(WorkflowSchema),
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

/**
 * INSERT Tool - Create a new workflow
 */
export const createInsertTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_INSERT",
    description: "Create a new workflow",
    inputSchema: createCollectionInsertInputSchema(WorkflowSchema),
    outputSchema: createCollectionInsertOutputSchema(WorkflowSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

      const user = env.DECO_CHAT_REQUEST_CONTEXT?.ensureAuthenticated?.();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const { data } = context;

      const result = await env.DATABASE.DATABASES_RUN_SQL({
        sql: `
          INSERT INTO workflows (
            id, name, created_at, updated_at, created_by, updated_by,
            description, steps
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
          RETURNING *
        `,
        params: [
          id,
          data.name,
          now,
          now,
          user?.id || null,
          user?.id || null,
          data.description,
          JSON.stringify(data.steps || []),
        ],
      });

      return {
        item: transformDbRowToWorkflow(
          result.result[0]?.results?.[0] as Record<string, unknown>,
        ),
      };
    },
  });

/**
 * UPDATE Tool - Update an existing workflow
 */
export const createUpdateTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_WORKFLOWS_UPDATE",
    description: "Update an existing workflow",
    inputSchema: createCollectionUpdateInputSchema(WorkflowSchema),
    outputSchema: createCollectionUpdateOutputSchema(WorkflowSchema),
    execute: async ({ context }) => {
      await ensureTable(env, "workflows");

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

/**
 * DELETE Tool - Delete a workflow by ID
 */
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

const handleSandboxStep = async (step: {
  name: string;
  execute: string;
  stepInput: unknown;
}) => {
  const code = step.execute
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");

  const stepEvaluation = await evalCodeAndReturnDefaultHandle(code, step.name);

  const {
    ctx: stepCtx,
    defaultHandle: stepDefaultHandle,
    guestConsole: stepConsole,
  } = stepEvaluation;
  let result: unknown;

  try {
    const stepCallHandle = await callFunction(
      stepCtx,
      stepDefaultHandle,
      undefined,
      step.stepInput,
    );

    const unwrappedResult = stepCtx.unwrapResult(stepCallHandle);
    result = stepCtx.dump(unwrappedResult);

    // Log any console output from the step execution
    if (stepConsole.logs.length > 0) {
      console.log(`Step '${step.name}' logs:`, stepConsole.logs);
    }
  } finally {
    stepCtx.dispose();
  }
  return result;
};

export const runWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "START_EXECUTION",
    description: "Run one or more MCP tools with durable execution",
    inputSchema: z.object({
      executionId: z.string(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown(),
    }),
    execute: async ({ context: ctx }) => {
      try {
        const { executionId } = ctx;

        const { item: execution } =
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_GET({
            id: executionId,
          });
        if (!execution) {
          throw new Error(`Execution with id ${executionId} not found`);
        }

        if (execution.status !== "running" && execution.status !== "pending") {
          throw new Error(
            `Execution with id ${executionId} is not running or pending`,
          );
        }

        const { item: workflow } = await env.SELF.DECO_COLLECTION_WORKFLOWS_GET(
          {
            id: execution.workflow_id,
          },
        );
        if (!workflow) {
          throw new Error(
            `Workflow with id ${execution.workflow_id} not found`,
          );
        }

        const { items: existingResults } =
          await env.SELF.DECO_COLLECTION_EXECUTION_STEP_RESULTS_GET_ALL({
            id: executionId,
          });

        const lastResult = existingResults[existingResults.length - 1];
        const matchingStepIndex = workflow.steps.findIndex(
          (step) => step.name === lastResult?.step_id,
        );
        const currentStepIndex = lastResult
          ? lastResult.completed_at_epoch_ms === null
            ? matchingStepIndex
            : matchingStepIndex + 1
          : 0;

        const steps = workflow.steps;
        const step = steps[currentStepIndex];
        const initialStepInput =
          (execution.inputs?.[step.name] as Record<string, unknown>) || {};
        const fromPreviousStepOutput =
          existingResults[existingResults.length - 1]?.output;

        let stepInput = {
          ...initialStepInput,
          ...fromPreviousStepOutput,
        };
        if (step.inputSchema) {
          const inputValidation = validate(stepInput, step.inputSchema);
          if (!inputValidation.valid) {
            const errorMessage = `Step '${step.name}' input validation failed after ref resolution: ${inspect(
              inputValidation.errors,
            )}`;
            console.error(`[INPUT VALIDATION]`, errorMessage);
            throw new Error(errorMessage);
          }
        }
        const [stepResult, executionUpdate] = await Promise.all([
          env.SELF.DECO_COLLECTION_EXECUTION_STEP_RESULTS_INSERT({
            data: {
              execution_id: executionId,
              step_id: step.name,
              started_at_epoch_ms: new Date().getTime(),
            },
          }),
          env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE({
            id: executionId,
            data: {
              status: "running",
              started_at_epoch_ms: new Date().getTime(),
            },
          }),
        ]);

        let result: unknown;
        if (typeof step.execute === "string") {
          result = await handleSandboxStep({
            execute: step.execute,
            stepInput: stepInput,
            name: step.name,
          });
        } else {
          const connection = proxyConnectionForId(step.execute.connectionId, {
            workspace: env.DECO_WORKSPACE,
            token: env.DECO_REQUEST_CONTEXT.token,
          });

          result = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
            connection: connection as any,
            params: {
              name: step.execute.toolName,
              arguments: stepInput,
            },
          });
        }

        await env.SELF.DECO_COLLECTION_EXECUTION_STEP_RESULTS_UPDATE({
          data: {
            completed_at_epoch_ms: new Date().getTime(),
            step_id: step.name,
            execution_id: executionId,
            output: result as Record<string, unknown>,
          },
        });

        const isLastStep = currentStepIndex === steps.length - 1;

        if (!isLastStep) {
          await env.WORKFLOW_QUEUE.send({
            executionId,
            nextStepName: steps[currentStepIndex + 1].name,
            ctx: env,
          });
        }

        if (isLastStep) {
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE({
            id: executionId,
            data: {
              status: "completed" as const,
              output: result as Record<string, unknown>,
            },
          });
        }

        return {
          success: true,
          result: result,
        };
      } catch (error) {
        console.error("Error in workflow execution:", error);
        throw error;
      }
    },
  });

// Export all tools as an array
export const workflowTools = [
  createListTool,
  createGetTool,
  createInsertTool,
  createUpdateTool,
  createDeleteTool,
  runWorkflowTool,
];

export const proxyConnectionForId = (
  integrationId: string,
  {
    workspace,
    token,
  }: {
    workspace: string;
    token: string;
  },
  decoChatApiUrl?: string,
  appName?: string,
) => {
  let headers: Record<string, string> | undefined = appName
    ? { "x-caller-app": appName }
    : undefined;
  return {
    type: "HTTP",
    url: createIntegrationsUrl({
      integrationId,
      workspace: workspace,
      decoCmsApiUrl: decoChatApiUrl,
    }),
    token: token,
    headers,
  };
};

interface IntegrationContext {
  integrationId: string;
  workspace: string;
  branch?: string;
  decoCmsApiUrl?: string;
}

const normalizeWorkspace = (workspace: string) => {
  if (workspace.startsWith("/users")) {
    return workspace;
  }
  if (workspace.startsWith("/shared")) {
    return workspace;
  }
  if (workspace.includes("/")) {
    return workspace;
  }
  return `/shared/${workspace}`;
};

const createIntegrationsUrl = ({
  integrationId,
  workspace,
  decoCmsApiUrl,
  branch,
}: IntegrationContext) => {
  const base = `${normalizeWorkspace(workspace)}/${integrationId}/mcp`;
  const url = new URL(base, decoCmsApiUrl ?? "https://api.decocms.com");
  branch && url.searchParams.set("branch", branch);
  return url.href;
};
