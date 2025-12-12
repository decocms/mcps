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
  WorkflowExecutionStepResult,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import z from "zod";

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

/** Transform DB row to WorkflowExecution (with optional runtime_context) */
export function transformDbRowToExecution(
  row: Record<string, unknown> = {},
): WorkflowExecution & { runtime_context?: unknown } {
  const transformed = {
    ...row,
    title: row.title ?? `Execution ${row.id}`,
    start_at_epoch_ms: toNumberOrNull(row.start_at_epoch_ms),
    timeout_ms: toNumberOrNull(row.timeout_ms),
    deadline_at_epoch_ms: toNumberOrNull(row.deadline_at_epoch_ms),
    completed_at_epoch_ms: toNumberOrNull(row.completed_at_epoch_ms),
    created_at: epochMsToIsoString(row.created_at),
    updated_at: epochMsToIsoString(row.updated_at),
    input: safeJsonParse(row.input),
    runtime_context: safeJsonParse(row.runtime_context),
  };
  const parsed = WorkflowExecutionSchema.parse(transformed);
  return { ...parsed, runtime_context: transformed.runtime_context };
}

/** Transform DB row to WorkflowExecutionStepResult */
export function transformDbRowToStepResult(
  row: Record<string, unknown> = {},
): WorkflowExecutionStepResult {
  const startedAt = epochMsToIsoString(row.started_at_epoch_ms);
  const completedAt = row.completed_at_epoch_ms
    ? epochMsToIsoString(row.completed_at_epoch_ms)
    : startedAt;

  return WorkflowExecutionStepResultSchema.parse({
    ...row,
    id: row.id ?? `${row.execution_id}/${row.step_id}`,
    title: row.title ?? `Step_${row.step_id}`,
    created_at: startedAt,
    updated_at: completedAt,
    started_at_epoch_ms: toNumberOrNull(row.started_at_epoch_ms),
    completed_at_epoch_ms: toNumberOrNull(row.completed_at_epoch_ms),
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
    error: safeJsonParse(row.error),
  });
}

/** Transform DB row to WorkflowEvent */
export function transformDbRowToEvent(
  row: Record<string, unknown>,
): WorkflowEvent {
  return WorkflowEventSchema.parse({
    ...row,
    created_at: epochMsToIsoString(Number(row.created_at)),
    title: row.title ?? `Event ${row.id}`,
    updated_at: epochMsToIsoString(Number(row.updated_at ?? Date.now())),
    visible_at: Number(row.visible_at),
    payload: row.payload
      ? typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload
      : undefined,
  });
}

// ============================================================================
// Schema Types
// ============================================================================

export const QueueMessageSchema = z.object({
  executionId: z.string(),
  retryCount: z.number().default(0),
  enqueuedAt: z.number(),
  authorization: z.string(),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

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
  stepStreamChunksTableIdempotentQuery: string;
  stepStreamChunksTableIndexesQuery: string;
}
