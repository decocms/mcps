// ============================================================================
// PostgreSQL Dialect
// ============================================================================

import type { WorkflowQueries } from "../transformers.ts";

const postgresWorkflowCollectionTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflow_collection (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    input JSONB,
    gateway_id TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT
  )
`;

const postgresWorkflowCollectionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_collection_created_at ON workflow_collection(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_collection_updated_at ON workflow_collection(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_collection_title ON workflow_collection(title);
`;

const postgresWorkflowTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflow (
    id TEXT PRIMARY KEY,
    workflow_collection_id TEXT,
    steps JSONB NOT NULL DEFAULT '{}',
    input JSONB,
    gateway_id TEXT NOT NULL,
    created_at_epoch_ms BIGINT NOT NULL,
    created_by TEXT
  )
`;

const postgresWorkflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_created_at_epoch ON workflow(created_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_collection_id ON workflow(workflow_collection_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_gateway_id ON workflow(gateway_id);
`;

const postgresWorkflowExecutionTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_execution (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('enqueued', 'cancelled', 'success', 'error', 'running')),
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
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_status ON workflow_execution(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_created_at ON workflow_execution(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_start_at ON workflow_execution(start_at_epoch_ms);
`;

const postgresExecutionStepResultsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_execution_step_result (
  execution_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  started_at_epoch_ms BIGINT,
  completed_at_epoch_ms BIGINT,
  output JSONB,
  error JSONB,
  PRIMARY KEY (execution_id, step_id),
  FOREIGN KEY (execution_id) REFERENCES workflow_execution(id)
)
`;

const postgresExecutionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_execution ON workflow_execution_step_result(execution_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_started ON workflow_execution_step_result(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_completed ON workflow_execution_step_result(completed_at_epoch_ms DESC);
`;

const postgresWorkflowEventsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS workflow_event (
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
  
  FOREIGN KEY (execution_id) REFERENCES workflow_execution(id)
)
`;

const postgresWorkflowEventsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_event_pending 
    ON workflow_event(execution_id, type, consumed_at, visible_at) 
    WHERE consumed_at IS NULL;
  
  CREATE INDEX IF NOT EXISTS idx_workflow_event_by_name 
    ON workflow_event(execution_id, type, name) 
    WHERE consumed_at IS NULL;
  
  CREATE INDEX IF NOT EXISTS idx_workflow_event_output 
    ON workflow_event(execution_id, name) 
    WHERE type = 'output';
  
  CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_event_output_unique 
    ON workflow_event(execution_id, type, name) 
    WHERE type = 'output';
  
  CREATE INDEX IF NOT EXISTS idx_workflow_event_source 
    ON workflow_event(source_execution_id) 
    WHERE source_execution_id IS NOT NULL;
  
  CREATE INDEX IF NOT EXISTS idx_workflow_event_created 
    ON workflow_event(execution_id, created_at);
    `;

export const postgresQueries: WorkflowQueries = {
  workflowCollectionTableIdempotentQuery:
    postgresWorkflowCollectionTableIdempotentQuery,
  workflowCollectionTableIndexesQuery:
    postgresWorkflowCollectionTableIndexesQuery,
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
