/**
 * Workflow Studio Adapter
 *
 * Calls MCP Studio for workflow and execution management.
 * MCP Studio handles both PostgreSQL and file-based workflows.
 */

import type { Workflow } from "../types/workflow.ts";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowStudioClient {
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

interface StudioWorkflow {
  id: string;
  title: string;
  description?: string;
  steps: unknown[];
  created_at?: string;
  updated_at?: string;
  readonly?: boolean;
}

interface ListResult {
  items: StudioWorkflow[];
  totalCount: number;
  hasMore: boolean;
}

interface GetResult {
  item: StudioWorkflow | null;
}

// ============================================================================
// Client State
// ============================================================================

let studioClient: WorkflowStudioClient | null = null;

/**
 * Set the workflow studio client (called when binding is configured)
 */
export function setWorkflowStudioClient(client: WorkflowStudioClient): void {
  studioClient = client;
  console.error("[workflow-adapter] Studio client configured");
}

/**
 * Check if studio client is available
 */
export function hasStudioClient(): boolean {
  return studioClient !== null;
}

/**
 * Ensure studio client is configured, throw if not
 */
function requireStudioClient(): WorkflowStudioClient {
  if (!studioClient) {
    throw new Error(
      "WORKFLOW_STUDIO binding not configured. Add mcp-studio as a dependency in Mesh.",
    );
  }
  return studioClient;
}

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform MCP Studio workflow to Pilot's Workflow type
 */
function transformFromStudio(studio: StudioWorkflow): Workflow {
  return {
    id: studio.id,
    title: studio.title,
    description: studio.description,
    steps: studio.steps as Workflow["steps"],
    createdAt: studio.created_at,
    updatedAt: studio.updated_at,
  };
}

/**
 * Transform Pilot's Workflow to MCP Studio format
 */
function transformToStudio(
  workflow: Workflow,
): Omit<StudioWorkflow, "created_at" | "updated_at"> {
  return {
    id: workflow.id,
    title: workflow.title,
    description: workflow.description,
    steps: workflow.steps,
  };
}

// ============================================================================
// Workflow CRUD (via MCP Studio)
// ============================================================================

/**
 * Load a workflow by ID
 */
export async function loadWorkflow(
  workflowId: string,
): Promise<Workflow | null> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool("COLLECTION_WORKFLOW_GET", {
      id: workflowId,
    })) as GetResult;

    if (result.item) {
      return transformFromStudio(result.item);
    }
    return null;
  } catch (error) {
    console.error(
      `[workflow-adapter] Error loading workflow "${workflowId}":`,
      error,
    );
    throw error;
  }
}

/**
 * List all workflows
 */
export async function listWorkflows(): Promise<Workflow[]> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool("COLLECTION_WORKFLOW_LIST", {
      limit: 100,
    })) as ListResult;

    return (result.items || []).map(transformFromStudio);
  } catch (error) {
    console.error("[workflow-adapter] Error listing workflows:", error);
    throw error;
  }
}

/**
 * Save a workflow (create or update)
 */
export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const client = requireStudioClient();

  try {
    // Check if workflow exists
    const existingResult = (await client.callTool("COLLECTION_WORKFLOW_GET", {
      id: workflow.id,
    })) as GetResult;

    if (existingResult.item) {
      // Check if readonly (file-based)
      if (existingResult.item.readonly) {
        throw new Error(
          `Cannot update "${workflow.id}" - it's a file-based workflow. Edit the JSON file directly.`,
        );
      }

      // Update existing
      await client.callTool("COLLECTION_WORKFLOW_UPDATE", {
        id: workflow.id,
        data: transformToStudio(workflow),
      });
      console.error(`[workflow-adapter] Updated workflow "${workflow.id}"`);
    } else {
      // Create new
      await client.callTool("COLLECTION_WORKFLOW_CREATE", {
        data: transformToStudio(workflow),
      });
      console.error(`[workflow-adapter] Created workflow "${workflow.id}"`);
    }
  } catch (error) {
    console.error(
      `[workflow-adapter] Error saving workflow "${workflow.id}":`,
      error,
    );
    throw error;
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<boolean> {
  const client = requireStudioClient();

  try {
    await client.callTool("COLLECTION_WORKFLOW_DELETE", {
      id: workflowId,
    });
    console.error(`[workflow-adapter] Deleted workflow "${workflowId}"`);
    return true;
  } catch (error) {
    console.error(
      `[workflow-adapter] Error deleting workflow "${workflowId}":`,
      error,
    );
    return false;
  }
}

/**
 * Duplicate a workflow (useful for customizing file-based workflows)
 */
export async function duplicateWorkflow(
  workflowId: string,
  newId?: string,
  newTitle?: string,
): Promise<string> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool("COLLECTION_WORKFLOW_DUPLICATE", {
      id: workflowId,
      new_id: newId,
      new_title: newTitle,
    })) as { item: StudioWorkflow };

    console.error(
      `[workflow-adapter] Duplicated "${workflowId}" → "${result.item.id}"`,
    );
    return result.item.id;
  } catch (error) {
    console.error(
      `[workflow-adapter] Error duplicating workflow "${workflowId}":`,
      error,
    );
    throw error;
  }
}

// ============================================================================
// Execution Tracking
// ============================================================================

export interface ExecutionInput {
  workflowId?: string;
  steps?: unknown[];
  input: Record<string, unknown>;
  gatewayId: string;
}

export interface Execution {
  id: string;
  workflow_id: string;
  status: "enqueued" | "running" | "success" | "error" | "failed" | "cancelled";
  input?: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  completed_steps?: {
    success: string[];
    error: string[];
  };
}

/**
 * Create a workflow execution
 */
export async function createExecution(
  input: ExecutionInput,
): Promise<{ id: string; workflow_id: string } | null> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool(
      "COLLECTION_WORKFLOW_EXECUTION_CREATE",
      {
        workflow_collection_id: input.workflowId,
        steps: input.steps,
        input: input.input,
        gateway_id: input.gatewayId,
      },
    )) as { id: string; workflow_id: string };

    console.error(`[workflow-adapter] Created execution: ${result.id}`);
    return result;
  } catch (error) {
    console.error("[workflow-adapter] Error creating execution:", error);
    return null;
  }
}

/**
 * Get an execution by ID
 */
export async function getExecution(
  executionId: string,
): Promise<Execution | null> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool("COLLECTION_WORKFLOW_EXECUTION_GET", {
      id: executionId,
    })) as { item: Execution };

    return result.item;
  } catch (error) {
    console.error(
      `[workflow-adapter] Error getting execution ${executionId}:`,
      error,
    );
    return null;
  }
}

/**
 * List executions
 */
export async function listExecutions(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ items: Execution[]; totalCount: number; hasMore: boolean }> {
  const client = requireStudioClient();

  try {
    const result = (await client.callTool(
      "COLLECTION_WORKFLOW_EXECUTION_LIST",
      { limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
    )) as { items: Execution[]; totalCount: number; hasMore: boolean };

    return result;
  } catch (error) {
    console.error("[workflow-adapter] Error listing executions:", error);
    return { items: [], totalCount: 0, hasMore: false };
  }
}
