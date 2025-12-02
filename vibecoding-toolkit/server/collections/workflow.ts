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
 * Wait For Signal Action Schema
 *
 * Blocks workflow execution until an external signal is received.
 * Perfect for human-in-the-loop patterns like approvals, reviews, or manual steps.
 *
 * The step will:
 * 1. Record itself as "waiting" status
 * 2. Release the execution lock (allows other work to proceed)
 * 3. Wait until a matching signal is received
 * 4. Resume with the signal payload as output
 *
 * Signals can be sent via:
 * - sendSignal() function (internal API)
 * - External webhook (future)
 * - UI interaction (future)
 */
export const WaitForSignalActionSchema = z.object({
  signalName: z
    .string()
    .describe("Name of the signal to wait for (must be unique per execution)"),
  timeoutMs: z
    .number()
    .optional()
    .describe("Maximum time to wait in milliseconds (default: no timeout)"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of what this signal is waiting for"),
});

/**
 * Step Schema - Unified schema for all step types
 *
 * Step types:
 * - tool: Call external service via MCP (non-deterministic, checkpointed)
 * - transform: Pure TypeScript data transformation (deterministic, replayable)
 * - sleep: Wait for time
 * - waitForSignal: Block until external signal (human-in-the-loop)
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
    WaitForSignalActionSchema.describe(
      "Wait for external signal (human-in-the-loop)",
    ),
  ]),
  input: z
    .record(z.unknown())
    .optional()
    .describe(
      "Input object with @ref resolution. Example: { 'user_id': '@input.user_id', 'product_id': '@input.product_id' }",
    ),
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
   * Input for the new execution (uses @refs like step inputs)
   * Maps output data to workflow input fields.
   *
   * If any @ref doesn't resolve (property missing), this trigger is SKIPPED.
   */
  input: z
    .record(z.unknown())
    .describe(
      "Input mapping with @refs from current workflow output. Example: { 'user_id': '@stepName.output.user_id' }",
    ),
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
 * - cancelled: Manually cancelled
 */

const WorkflowExecutionStatusEnum = z
  .enum(["pending", "running", "completed", "cancelled"])
  .default("pending");
type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusEnum>;

/**
 * Workflow Execution Schema
 *
 * Includes lock columns and retry tracking.
 */
const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  status: WorkflowExecutionStatusEnum,
  input: z.record(z.unknown()).optional(),
  output: z.unknown().optional(),
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
  input TEXT,
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

  input: z.record(z.unknown()).nullish(),
  output: z.unknown().nullish(), // Can be object or array (forEach steps produce arrays)
  error: z.string().nullish(),
  started_at_epoch_ms: z.number().nullish(),
  completed_at_epoch_ms: z.number().nullish(),
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
  started_at_epoch_ms INTEGER,
  completed_at_epoch_ms INTEGER,
  output TEXT,
  error TEXT,
  PRIMARY KEY (execution_id, step_id),
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const executionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_step_results_execution ON execution_step_results(execution_id);
  CREATE INDEX IF NOT EXISTS idx_step_results_started ON execution_step_results(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_step_results_completed ON execution_step_results(completed_at_epoch_ms DESC);
`;

// ============================================================================
// Workflow Events Schema
// ============================================================================

/**
 * Event Type Enum
 *
 * Event types for the unified events table:
 * - signal: External signal (human-in-the-loop)
 * - timer: Durable sleep wake-up
 * - message: Inter-workflow communication (send/recv)
 * - output: Published value (setEvent/getEvent)
 * - step_started: Observability - step began
 * - step_completed: Observability - step finished
 * - workflow_started: Workflow began execution
 * - workflow_completed: Workflow finished
 */
export const EventTypeEnum = z.enum([
  "signal",
  "timer",
  "message",
  "output",
  "step_started",
  "step_completed",
  "workflow_started",
  "workflow_completed",
]);

export type EventType = z.infer<typeof EventTypeEnum>;

/**
 * Workflow Event Schema
 *
 * Unified events table for signals, timers, messages, and observability.
 * Inspired by DBOS send/recv patterns and deco-cx/durable visible_at.
 */
export const WorkflowEventSchema = z.object({
  id: z.string(),
  execution_id: z.string(),
  type: EventTypeEnum,
  name: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  payload: z.unknown().optional(),
  created_at: z.number(),
  visible_at: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  consumed_at: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  source_execution_id: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
});

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

const workflowEventsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  
  -- Event classification
  type TEXT NOT NULL CHECK(type IN (
    'signal',
    'timer',
    'message',
    'output',
    'step_started',
    'step_completed',
    'workflow_started',
    'workflow_completed'
  )),
  
  -- Event data
  name TEXT,
  payload TEXT,
  
  -- Timing
  created_at INTEGER NOT NULL,
  visible_at INTEGER,
  consumed_at INTEGER,
  
  -- Inter-workflow messaging
  source_execution_id TEXT,
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const workflowEventsTableIndexesQuery = `
  -- For efficient pending event queries
  CREATE INDEX IF NOT EXISTS idx_events_pending 
    ON workflow_events(execution_id, type, consumed_at, visible_at) 
    WHERE consumed_at IS NULL;
  
  -- For lookups by name (signals, timers)
  CREATE INDEX IF NOT EXISTS idx_events_by_name 
    ON workflow_events(execution_id, type, name) 
    WHERE consumed_at IS NULL;
  
  -- For output events (setEvent/getEvent)
  CREATE INDEX IF NOT EXISTS idx_events_output 
    ON workflow_events(execution_id, name) 
    WHERE type = 'output';
  
  -- Unique constraint for setEvent/getEvent (upsert pattern)
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_output_unique 
    ON workflow_events(execution_id, type, name) 
    WHERE type = 'output';
  
  -- For inter-workflow message lookup
  CREATE INDEX IF NOT EXISTS idx_events_source 
    ON workflow_events(source_execution_id) 
    WHERE source_execution_id IS NOT NULL;
  
  -- For event streaming (chronological order)
  CREATE INDEX IF NOT EXISTS idx_events_created 
    ON workflow_events(execution_id, created_at);
`;

/**
 * Transform database row to WorkflowEvent
 */
function transformDbRowToEvent(row: Record<string, unknown>): WorkflowEvent {
  const transformed = {
    ...row,
    payload: row.payload ? JSON.parse(row.payload as string) : undefined,
  };

  return WorkflowEventSchema.parse(transformed);
}

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
    input: row.input ? JSON.parse(row.input as string) : undefined,
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
  WorkflowExecutionStatusEnum,
  WorkflowExecutionSchema,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  transformDbRowToExecution,

  // Execution Step Results
  ExecutionStepResultSchema,
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
  transformDbRowToStepResult,

  // Workflow Events (EventTypeEnum, WorkflowEventSchema already inline exported)
  workflowEventsTableIdempotentQuery,
  workflowEventsTableIndexesQuery,
  transformDbRowToEvent,

  // Queue
  QueueMessageSchema,
};

export type {
  WorkflowExecution,
  ExecutionStepResult,
  QueueMessage,
  WorkflowExecutionStatus,
};
