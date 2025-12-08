// ============================================================================
// PostgreSQL Dialect
// ============================================================================

import { WorkflowQueries } from "../workflow";

const postgresWorkflowTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '{}',
    triggers JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT
  )
`;

const postgresWorkflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_title ON workflows(title);
`;

const postgresWorkflowExecutionTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  parent_execution_id TEXT,
  
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  started_at_epoch_ms BIGINT,
  completed_at_epoch_ms BIGINT,
  
  locked_until_epoch_ms BIGINT,
  lock_id TEXT,
  
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  error JSONB,
  
  created_by TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (parent_execution_id) REFERENCES workflow_executions(id)
)
`;

const postgresWorkflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_updated_at ON workflow_executions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_parent ON workflow_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_executions_lock ON workflow_executions (status, locked_until_epoch_ms) WHERE status IN ('pending', 'running');
  CREATE INDEX IF NOT EXISTS idx_executions_recovery ON workflow_executions (status, retry_count) WHERE status = 'running';
`;

const postgresExecutionStepResultsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS execution_step_results (
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  started_at_epoch_ms BIGINT,
  completed_at_epoch_ms BIGINT,
  output JSONB,
  error JSONB,
  PRIMARY KEY (execution_id, step_id),
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const postgresExecutionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_step_results_execution ON execution_step_results(execution_id);
  CREATE INDEX IF NOT EXISTS idx_step_results_started ON execution_step_results(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_step_results_completed ON execution_step_results(completed_at_epoch_ms DESC);
`;

const postgresWorkflowEventsTableIdempotentQuery = `
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
  payload JSONB,
  
  created_at BIGINT NOT NULL,
  visible_at BIGINT,
  consumed_at BIGINT,
  
  source_execution_id TEXT,
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const postgresWorkflowEventsTableIndexesQuery = `
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

const postgresStepStreamChunksTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS step_stream_chunks (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_data JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(execution_id, step_id, chunk_index),
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
)
`;

const postgresStepStreamChunksTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_stream_chunks_execution ON step_stream_chunks(execution_id);
  CREATE INDEX IF NOT EXISTS idx_stream_chunks_step ON step_stream_chunks(execution_id, step_id);
  CREATE INDEX IF NOT EXISTS idx_stream_chunks_created ON step_stream_chunks(created_at);
`;

export const postgresQueries: WorkflowQueries = {
  workflowTableIdempotentQuery: postgresWorkflowTableIdempotentQuery,
  workflowTableIndexesQuery: postgresWorkflowTableIndexesQuery,
  workflowExecutionTableIdempotentQuery:
    postgresWorkflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery:
    postgresWorkflowExecutionTableIndexesQuery,
  executionStepResultsTableIdempotentQuery:
    postgresExecutionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery:
    postgresExecutionStepResultsTableIndexesQuery,
  workflowEventsTableIdempotentQuery:
    postgresWorkflowEventsTableIdempotentQuery,
  workflowEventsTableIndexesQuery: postgresWorkflowEventsTableIndexesQuery,
  stepStreamChunksTableIdempotentQuery:
    postgresStepStreamChunksTableIdempotentQuery,
  stepStreamChunksTableIndexesQuery: postgresStepStreamChunksTableIndexesQuery,
};
