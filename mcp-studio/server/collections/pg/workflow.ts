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
  workflow_id TEXT,
  steps JSONB NOT NULL DEFAULT '{}',
  status TEXT,
  input JSONB,
  output JSONB,
  
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())*1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())*1000)::bigint,
  start_at_epoch_ms BIGINT,
  started_at_epoch_ms BIGINT,
  completed_at_epoch_ms BIGINT,

  timeout_ms BIGINT,
  deadline_at_epoch_ms BIGINT,
  error JSONB,
  
  created_by TEXT
)
`;

const postgresWorkflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_start_at ON workflow_executions(start_at_epoch_ms);
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
};
