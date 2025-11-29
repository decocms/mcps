import { agentTableIdempotentQuery, agentTableIndexesQuery } from "./agent";
import {
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
} from "./workflow";

/**
 * Collection queries for database table creation.
 * 
 * Note: Only 'agents' and 'workflows' are true collections with MCP tools.
 * 'workflow_executions' and 'execution_step_results' are internal engine tables
 * managed by direct database functions in lib/execution-db.ts.
 */
const collectionsQueries = {
  agents: {
    idempotent: agentTableIdempotentQuery,
    indexes: agentTableIndexesQuery,
  },
  workflows: {
    idempotent: workflowTableIdempotentQuery,
    indexes: workflowTableIndexesQuery,
  },
  // Internal engine tables (not collections, no MCP tools)
  workflow_executions: {
    idempotent: workflowExecutionTableIdempotentQuery,
    indexes: workflowExecutionTableIndexesQuery,
  },
  execution_step_results: {
    idempotent: executionStepResultsTableIdempotentQuery,
    indexes: executionStepResultsTableIndexesQuery,
  },
};

export { collectionsQueries };
