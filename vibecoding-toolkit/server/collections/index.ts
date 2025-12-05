import { agentTableIdempotentQuery, agentTableIndexesQuery } from "./agent";
import {
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
  workflowEventsTableIdempotentQuery,
  workflowEventsTableIndexesQuery,
} from "./workflow";
import { toolsTableIdempotentQuery, toolsTableIndexesQuery } from "./tools";
import { Env } from "server/main";

/**
 * Collection queries for database table creation.
 *
 * Note: Only 'agents' and 'workflows' are true collections with MCP tools.
 * 'workflow_executions', 'execution_step_results', and 'workflow_events'
 * are internal engine tables managed by direct database functions.
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
  workflow_events: {
    idempotent: workflowEventsTableIdempotentQuery,
    indexes: workflowEventsTableIndexesQuery,
  },
  tools: {
    idempotent: toolsTableIdempotentQuery,
    indexes: toolsTableIndexesQuery,
  },
};

async function ensureCollections(env: Env) {
  for (const collection of Object.values(collectionsQueries)) {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: collection.idempotent,
      params: [],
    });
  }
}

export { collectionsQueries, ensureCollections };
