import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { StepSchema } from "../workflow/schema.ts";
import z from "zod";

// ============================================================================
// Workflow Schema
// ============================================================================

const WorkflowSchema = BaseCollectionEntitySchema.extend({
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(z.array(StepSchema)),
});

const workflowTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
  )
`;

const workflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
`;

// ============================================================================
// Workflow Execution Schema
// ============================================================================

/**
 * Workflow Execution Status
 *
 * States:
 * - pending: Created but not started
 * - running: Currently executing
 * - completed: Successfully finished
 * - failed: Permanently failed (max retries exceeded or non-retryable error)
 * - cancelled: Manually cancelled
 */
const WorkflowExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;

/**
 * Workflow Execution Schema
 *
 * Includes lock columns and retry tracking.
 */
const WorkflowExecutionSchema = BaseCollectionEntitySchema.extend({
  workflow_id: z.string(),
  status: WorkflowExecutionStatusSchema,

  // Input/Output
  inputs: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),

  // Timing
  started_at_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  completed_at_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),

  // Timeout configuration
  workflow_timeout_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  workflow_deadline_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),

  // Lock columns
  locked_at: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  locked_until: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  lock_id: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),

  // Retry tracking
  retry_count: z
    .number()
    .default(0)
    .transform((val) => val ?? 0),
  max_retries: z
    .number()
    .default(10)
    .transform((val) => val ?? 10),
  last_error: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  last_retry_at: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),

  // Recovery tracking
  recovery_attempts: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  error: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),

  // Parent-child tracking for triggers
  parent_execution_id: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
}).omit({
  title: true,
});

type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

const workflowExecutionTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inputs TEXT,
  output TEXT,
  
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  
  -- Timeout
  workflow_timeout_ms INTEGER,
  workflow_deadline_epoch_ms INTEGER,
  
  -- Lock columns
  locked_at TEXT,
  locked_until TEXT,
  lock_id TEXT,
  
  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  last_error TEXT,
  last_retry_at TEXT,
  recovery_attempts INTEGER,
  error TEXT,
  
  -- User tracking
  created_by TEXT,
  updated_by TEXT,
  
  -- Parent-child tracking for triggers
  parent_execution_id TEXT,
  
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (parent_execution_id) REFERENCES workflow_executions(id)
)
`;

const workflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_updated_at ON workflow_executions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_executions_lock ON workflow_executions (status, locked_until) WHERE status IN ('pending', 'running');
  CREATE INDEX IF NOT EXISTS idx_executions_recovery ON workflow_executions (status, retry_count) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS idx_executions_parent ON workflow_executions(parent_execution_id);
`;

// ============================================================================
// Execution Step Results Schema
// ============================================================================

/**
 * Execution Step Result Schema
 *
 * Includes attempt tracking and error history.
 */
const ExecutionStepResultSchema = BaseCollectionEntitySchema.extend({
  execution_id: z.string(),
  step_id: z.string(),
  step_index: z.number().optional(),

  // Status
  status: z
    .enum(["pending", "running", "completed", "failed"])
    .default("pending"),

  // Input/Output
  input: z.record(z.unknown()).nullish(),
  output: z.unknown().nullish(), // Can be object or array (forEach steps produce arrays)
  error: z.string().nullish(),

  // Timing
  started_at_epoch_ms: z.number().nullish(),
  completed_at_epoch_ms: z.number().nullish(),

  // Retry tracking
  attempt_count: z.number().default(1),
  last_error: z.string().nullish(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        timestamp: z.string(),
        attempt: z.number(),
      }),
    )
    .default([]),

  // Child workflow reference
  child_workflow_id: z.string().nullish(),
}).omit({
  title: true,
  id: true,
  updated_at: true,
  created_at: true,
  created_by: true,
  updated_by: true,
});

type ExecutionStepResult = z.infer<typeof ExecutionStepResultSchema>;

const executionStepResultsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS execution_step_results (
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  step_index INTEGER,
  
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  
  -- Retry tracking
  attempt_count INTEGER DEFAULT 1,
  last_error TEXT,
  errors TEXT DEFAULT '[]',
  
  -- Child workflow
  child_workflow_id TEXT,
  
  PRIMARY KEY (execution_id, step_id),
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const executionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_step_results_execution ON execution_step_results(execution_id);
  CREATE INDEX IF NOT EXISTS idx_step_results_status ON execution_step_results(status);
  CREATE INDEX IF NOT EXISTS idx_step_results_started ON execution_step_results(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_step_results_completed ON execution_step_results(completed_at_epoch_ms DESC);
`;

// ============================================================================
// Queue Message Schema
// ============================================================================

/**
 * Queue Message Schema
 *
 * The message format for workflow queue.
 */
const QueueMessageSchema = z.object({
  executionId: z.string(),
  retryCount: z.number().default(0),
  enqueuedAt: z.number(), // epoch ms
  authorization: z.string(),
});

type QueueMessage = z.infer<typeof QueueMessageSchema>;

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform database row to WorkflowExecution schema
 */
function transformDbRowToExecution(
  row: Record<string, unknown>,
): WorkflowExecution {
  const transformed = {
    ...row,
    inputs: row.inputs ? JSON.parse(row.inputs as string) : undefined,
    output: row.output ? JSON.parse(row.output as string) : undefined,
    retry_count: row.retry_count ?? 0,
    max_retries: row.max_retries ?? 10,
    errors: row.errors ? JSON.parse(row.errors as string) : [],
  };

  return WorkflowExecutionSchema.parse(transformed);
}

/**
 * Transform database row to ExecutionStepResult schema
 */
function transformDbRowToStepResult(
  row: Record<string, unknown>,
): ExecutionStepResult {
  const transformed = {
    ...row,
    input: row.input ? JSON.parse(row.input as string) : undefined,
    output: row.output ? JSON.parse(row.output as string) : undefined,
    errors: row.errors ? JSON.parse(row.errors as string) : [],
    attempt_count: row.attempt_count ?? 1,
  };

  return ExecutionStepResultSchema.parse(transformed);
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Workflow
  WorkflowSchema,
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,

  // Workflow Execution
  WorkflowExecutionStatusSchema,
  WorkflowExecutionSchema,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  transformDbRowToExecution,

  // Execution Step Results
  ExecutionStepResultSchema,
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
  transformDbRowToStepResult,

  // Queue
  QueueMessageSchema,
};

export type {
  WorkflowExecutionStatus,
  WorkflowExecution,
  ExecutionStepResult,
  QueueMessage,
};
