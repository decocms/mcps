import {
  WorkflowEvent,
  WorkflowEventSchema,
  WorkflowExecution,
  WorkflowExecutionSchema,
  WorkflowExecutionStepResult,
  WorkflowExecutionStepResultSchema,
} from "@decocms/bindings/workflow";
import z from "zod";

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
): WorkflowExecutionStepResult {
  const transformed = {
    ...row,
    input: row.input ? JSON.parse(row.input as string) : undefined,
    output: row.output ? JSON.parse(row.output as string) : undefined,
    errors: row.errors ? JSON.parse(row.errors as string) : [],
    attempt_count: row.attempt_count ?? 1,
  };

  return WorkflowExecutionStepResultSchema.parse(transformed);
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Execution Step Results
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
  // Queue
  type QueueMessage,
  QueueMessageSchema,
  transformDbRowToEvent,
  transformDbRowToExecution,
  transformDbRowToStepResult,
  // Workflow Events (EventTypeEnum, WorkflowEventSchema already inline exported)
  workflowEventsTableIdempotentQuery,
  workflowEventsTableIndexesQuery,
  // Workflow Execution
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  // Workflow
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,
};
