import {
  WorkflowEvent,
  WorkflowEventSchema,
  WorkflowExecution,
  WorkflowExecutionSchema,
  WorkflowExecutionStepResult,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import z from "zod";

type WorkflowDialect = "sqlite" | "postgres";

interface WorkflowQueries {
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

function transformDbRowToEvent(row: Record<string, unknown>): WorkflowEvent {
  const transformed = {
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
  };

  return WorkflowEventSchema.parse(transformed);
}

const QueueMessageSchema = z.object({
  executionId: z.string(),
  retryCount: z.number().default(0),
  enqueuedAt: z.number(), // epoch ms
  authorization: z.string(),
});

type QueueMessage = z.infer<typeof QueueMessageSchema>;

/**
 * Convert epoch milliseconds to ISO datetime string
 * Handles number, bigint, and string representations (DB drivers may return bigint as string)
 */
const epochMsToIsoString = (epochMs: unknown): string => {
  if (epochMs === null || epochMs === undefined) {
    return new Date().toISOString();
  }
  const num =
    typeof epochMs === "string" ? parseInt(epochMs, 10) : Number(epochMs);
  if (isNaN(num)) {
    return new Date().toISOString();
  }
  return new Date(num).toISOString();
};

/**
 * Convert bigint/string to number (for epoch_ms fields that schema expects as number)
 */
const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return isNaN(num) ? null : num;
};

/**
 * Safely parse JSON
 */
const safeJsonParse = (value: unknown): unknown => {
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

/**
 * Transform database row to WorkflowExecution schema
 */
function transformDbRowToExecution(
  row: Record<string, unknown>,
): WorkflowExecution {
  const transformed = {
    ...row,
    title: row.title ?? `Execution ${row.id}`,
    created_at: epochMsToIsoString(row.created_at),
    updated_at: epochMsToIsoString(row.updated_at),
    started_at_epoch_ms: toNumberOrNull(row.started_at_epoch_ms),
    completed_at_epoch_ms: toNumberOrNull(row.completed_at_epoch_ms),
    locked_until_epoch_ms: toNumberOrNull(row.locked_until_epoch_ms),
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
    error: safeJsonParse(row.error),
    retry_count: row.retry_count ?? 0,
    max_retries: row.max_retries ?? 10,
  };

  return WorkflowExecutionSchema.parse(transformed);
}

function transformDbRowToStepResult(
  row: Record<string, unknown>,
): WorkflowExecutionStepResult {
  const startedAt = epochMsToIsoString(row.started_at_epoch_ms);
  const completedAt = row.completed_at_epoch_ms
    ? epochMsToIsoString(row.completed_at_epoch_ms)
    : startedAt;

  const transformed = {
    ...row,
    id: row.id ?? `${row.execution_id}/${row.step_id}`,
    title: row.title ?? `Step ${row.step_id}`,
    created_at: startedAt,
    updated_at: completedAt,
    started_at_epoch_ms: toNumberOrNull(row.started_at_epoch_ms),
    completed_at_epoch_ms: toNumberOrNull(row.completed_at_epoch_ms),
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
    error: safeJsonParse(row.error),
  };

  return WorkflowExecutionStepResultSchema.parse(transformed);
}

export {
  type QueueMessage,
  QueueMessageSchema,
  transformDbRowToEvent,
  transformDbRowToExecution,
  transformDbRowToStepResult,
  type WorkflowDialect,
  type WorkflowQueries,
};
