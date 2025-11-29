import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import z from "zod";

/**
 * Workflow Schema
 *
 * Implements the phase-based workflow model with:
 * - Unified step schema (tool, transform, sleep)
 * - Phase-based parallelism
 * - ForEach loop modifier
 * - Trigger support for workflow chaining
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

// ============================================================================
// Step Schema
// ============================================================================

export const ToolCallActionSchema = z.object({
  connectionId: z.string().describe("Integration connection ID"),
  toolName: z.string().describe("Name of the tool to call"),
});

export const CodeActionSchema = z.object({
  code: z.string().describe("TypeScript code for pure data transformation"),
});

export const SleepActionSchema = z.union([
  z.object({
    sleepMs: z.number().describe("Milliseconds to sleep"),
  }),
  z.object({
    sleepUntil: z.string().describe("ISO date string or @ref to sleep until"),
  }),
]);

/**
 * Step Schema - Unified schema for all step types
 *
 * Step types:
 * - tool: Call external service via MCP (non-deterministic, checkpointed)
 * - transform: Pure TypeScript data transformation (deterministic, replayable)
 * - sleep: Wait for time
 */
export const StepSchema = z.object({
  name: z.string().min(1).describe("Unique step name within workflow"),
  action: z.union([
    ToolCallActionSchema.describe(
      "Call an external tool (non-deterministic, checkpointed)",
    ),
    CodeActionSchema.describe(
      "Pure TypeScript data transformation (deterministic, replayable)",
    ),
    SleepActionSchema.describe("Wait for time"),
  ]),
  input: z
    .record(z.unknown())
    .optional()
    .describe(
      "Input object with @ref resolution. Example: { 'user_id': '@input.user_id', 'product_id': '@input.product_id' }",
    ),
  forEach: z
    .string()
    .optional()
    .describe("@ref to array - repeat step for each item"),
  maxIterations: z.number().default(100).describe("Maximum forEach iterations"),
  retry: z
    .object({
      maxAttempts: z.number().default(3).describe("Maximum retry attempts"),
      backoffMs: z
        .number()
        .default(1000)
        .describe("Initial backoff in milliseconds"),
    })
    .optional()
    .describe("Retry configuration"),
});

export type Step = z.infer<typeof StepSchema>;

// ============================================================================
// Trigger Schema
// ============================================================================

/**
 * Trigger Schema - Fire another workflow when execution completes
 */
export const TriggerSchema = z.object({
  /**
   * Target workflow ID to execute
   */
  workflowId: z.string().describe("Target workflow ID to trigger"),

  /**
   * Inputs for the new execution (uses @refs like step inputs)
   * Maps output data to workflow input fields.
   *
   * If any @ref doesn't resolve (property missing), this trigger is SKIPPED.
   */
  inputs: z
    .record(z.unknown())
    .describe("Input mapping with @refs from current workflow output"),

  /**
   * For array values: trigger one execution per item.
   * The @ref path to iterate over.
   * When set, @item and @index are available in inputs.
   */
  forEach: z
    .string()
    .optional()
    .describe("@ref to array - trigger one execution per item"),
});

export type Trigger = z.infer<typeof TriggerSchema>;

// ============================================================================
// Workflow Schema
// ============================================================================

/**
 * Workflow Schema - Phase-based parallelism
 *
 * Steps organized into phases:
 * - Phases execute sequentially
 * - Steps within a phase execute in parallel
 */
const WorkflowSchema = BaseCollectionEntitySchema.extend({
  description: z.string().optional().describe("Workflow description"),

  /**
   * Steps organized into phases.
   * - Phases execute sequentially
   * - Steps within a phase execute in parallel
   */
  steps: z
    .array(z.array(StepSchema))
    .describe("2D array: phases (sequential) containing steps (parallel)"),

  /**
   * Triggers to fire when execution completes successfully
   */
  triggers: z
    .array(TriggerSchema)
    .optional()
    .describe("Workflows to trigger on completion"),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

const workflowTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL DEFAULT '{}',
    triggers TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
  )
`;

const workflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_title ON workflows(title);
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
const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  status: WorkflowExecutionStatusSchema,
  inputs: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  // Parent execution (for triggered workflows)
  parent_execution_id: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  created_at: z.number(),
  updated_at: z.number(),
  started_at_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  completed_at_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  locked_until_epoch_ms_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  lock_id: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  retry_count: z
    .number()
    .default(0)
    .transform((val) => val ?? 0),
  max_retries: z
    .number()
    .default(10)
    .transform((val) => val ?? 10),
  error: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
});

type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

const workflowExecutionTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inputs TEXT,
  output TEXT,
  parent_execution_id TEXT,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  
  locked_until_epoch_ms INTEGER,
  lock_id TEXT,
  
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  error TEXT,
  
  created_by TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (parent_execution_id) REFERENCES workflow_executions(id)
)
`;

const workflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_updated_at ON workflow_executions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_parent ON workflow_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_executions_lock ON workflow_executions (status, locked_until_epoch_ms) WHERE status IN ('pending', 'running');
  CREATE INDEX IF NOT EXISTS idx_executions_recovery ON workflow_executions (status, retry_count) WHERE status = 'running';
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
}).omit({
  title: true,
  id: true,
  updated_at: true,
  created_at: true,
  created_by: true,
});

type ExecutionStepResult = z.infer<typeof ExecutionStepResultSchema>;

const executionStepResultsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS execution_step_results (
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  
  attempt_count INTEGER DEFAULT 1,
  last_error TEXT,
  errors TEXT DEFAULT '[]',
  
  
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
    error: row.error ? JSON.parse(row.error as string) : undefined,
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
