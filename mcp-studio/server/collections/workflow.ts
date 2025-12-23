/**
 * Workflow DB Transformers
 *
 * Single source of truth for database row transformations.
 * All workflow-related DB operations should import from here.
 */

import {
  WorkflowEvent,
  WorkflowEventSchema,
  WorkflowExecution,
  WorkflowExecutionSchema,
} from "@decocms/bindings/workflow";

// ============================================================================
// Utility Helpers
// ============================================================================

/** Convert epoch ms to ISO string. Handles number, bigint, string. */
export const epochMsToIsoString = (epochMs: unknown): string => {
  if (epochMs === null || epochMs === undefined)
    return new Date().toISOString();
  const num =
    typeof epochMs === "string" ? parseInt(epochMs, 10) : Number(epochMs);
  return isNaN(num) ? new Date().toISOString() : new Date(num).toISOString();
};

/** Convert bigint/string to number or null */
export const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return isNaN(num) ? null : num;
};

/** Safely parse JSON - handles JSONB already-parsed values */
export const safeJsonParse = (value: unknown): unknown => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
};

// ============================================================================
// Row Transformers
// ============================================================================

/** Transform DB row to WorkflowExecution */
export function transformDbRowToExecution(
  row: Record<string, unknown> = {},
): WorkflowExecution {
  const transformed = {
    ...row,
    start_at_epoch_ms: toNumberOrNull(row.start_at_epoch_ms),
    timeout_ms: toNumberOrNull(row.timeout_ms),
    deadline_at_epoch_ms: toNumberOrNull(row.deadline_at_epoch_ms),
    completed_at_epoch_ms: toNumberOrNull(row.completed_at_epoch_ms),
    created_at: epochMsToIsoString(row.created_at),
    updated_at: epochMsToIsoString(row.created_at),
    title: (row.title ?? "") as string,
    input: safeJsonParse(row.input),
  };
  const parsed = WorkflowExecutionSchema.parse(transformed);
  return { ...parsed };
}

export interface WorkflowExecutionStepResult {
  started_at_epoch_ms: number;
  completed_at_epoch_ms?: number;
  output?: unknown;
  error?: unknown;
  step_id: string;
  execution_id: string;
}
/** Transform DB row to WorkflowExecutionStepResult */
export function transformDbRowToStepResult(
  row: Record<string, unknown> = {},
): WorkflowExecutionStepResult {
  return {
    started_at_epoch_ms: toNumberOrNull(row.started_at_epoch_ms) ?? Date.now(),
    completed_at_epoch_ms:
      toNumberOrNull(row.completed_at_epoch_ms) ?? undefined,
    output: safeJsonParse(row.output),
    error: safeJsonParse(row.error),
    step_id: row.step_id as string,
    execution_id: row.execution_id as string,
  };
}

/** Transform DB row to WorkflowEvent */
export function transformDbRowToEvent(
  row: Record<string, unknown>,
): WorkflowEvent {
  return WorkflowEventSchema.parse({
    ...row,
    created_at: epochMsToIsoString(Number(row.created_at)),
    visible_at: Number(row.visible_at),
    consumed_at: row.consumed_at ? Number(row.consumed_at) : undefined,
    payload: row.payload
      ? typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload
      : undefined,
  });
}

// ============================================================================
// SQL Query Types (for dialect-specific implementations)
// ============================================================================

export interface WorkflowQueries {
  workflowTableIdempotentQuery: string;
  workflowTableIndexesQuery: string;
  workflowExecutionTableIdempotentQuery: string;
  workflowExecutionTableIndexesQuery: string;
  executionStepResultsTableIdempotentQuery: string;
  executionStepResultsTableIndexesQuery: string;
  workflowEventsTableIdempotentQuery: string;
  workflowEventsTableIndexesQuery: string;
}
