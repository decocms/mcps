// ============================================================================
// SQLite Dialect
// ============================================================================

import { WorkflowQueries } from "../workflow";

const sqliteWorkflowTableIdempotentQuery = `
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

const sqliteWorkflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_title ON workflows(title);
`;

const sqliteWorkflowExecutionTableIdempotentQuery = `
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

const sqliteWorkflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_updated_at ON workflow_executions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_parent ON workflow_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_executions_lock ON workflow_executions (status, locked_until_epoch_ms) WHERE status IN ('pending', 'running');
  CREATE INDEX IF NOT EXISTS idx_executions_recovery ON workflow_executions (status, retry_count) WHERE status = 'running';
`;

const sqliteExecutionStepResultsTableIdempotentQuery = `
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

const sqliteExecutionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_step_results_execution ON execution_step_results(execution_id);
  CREATE INDEX IF NOT EXISTS idx_step_results_started ON execution_step_results(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_step_results_completed ON execution_step_results(completed_at_epoch_ms DESC);
`;

const sqliteWorkflowEventsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  
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
  
  name TEXT,
  payload TEXT,
  
  created_at INTEGER NOT NULL,
  visible_at INTEGER,
  consumed_at INTEGER,
  
  source_execution_id TEXT,
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const sqliteWorkflowEventsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_events_pending 
    ON workflow_events(execution_id, type, consumed_at, visible_at) 
    WHERE consumed_at IS NULL;
  
  CREATE INDEX IF NOT EXISTS idx_events_by_name 
    ON workflow_events(execution_id, type, name) 
    WHERE consumed_at IS NULL;
  
  CREATE INDEX IF NOT EXISTS idx_events_output 
    ON workflow_events(execution_id, name) 
    WHERE type = 'output';
  
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_output_unique 
    ON workflow_events(execution_id, type, name) 
    WHERE type = 'output';
  
  CREATE INDEX IF NOT EXISTS idx_events_source 
    ON workflow_events(source_execution_id) 
    WHERE source_execution_id IS NOT NULL;
  
  CREATE INDEX IF NOT EXISTS idx_events_created 
    ON workflow_events(execution_id, created_at);
`;

export const sqliteQueries: WorkflowQueries = {
  workflowTableIdempotentQuery: sqliteWorkflowTableIdempotentQuery,
  workflowTableIndexesQuery: sqliteWorkflowTableIndexesQuery,
  workflowExecutionTableIdempotentQuery:
    sqliteWorkflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery: sqliteWorkflowExecutionTableIndexesQuery,
  executionStepResultsTableIdempotentQuery:
    sqliteExecutionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery:
    sqliteExecutionStepResultsTableIndexesQuery,
  workflowEventsTableIdempotentQuery: sqliteWorkflowEventsTableIdempotentQuery,
  workflowEventsTableIndexesQuery: sqliteWorkflowEventsTableIndexesQuery,
};
