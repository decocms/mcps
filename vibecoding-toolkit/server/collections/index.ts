import { runSQL } from "server/lib/postgres";
import { postgresQueries } from "./pg/workflow";
import { Env } from "server/main";

/**
 * Collection queries for database table creation.
 *
 * Note: Only 'agents' and 'workflows' are true collections with MCP tools.
 * 'workflow_executions', 'execution_step_results', and 'workflow_events'
 * are internal engine tables managed by direct database functions.
 */
const collectionsQueries = {
  workflows: {
    idempotent: postgresQueries.workflowTableIdempotentQuery,
    indexes: postgresQueries.workflowTableIndexesQuery,
  },
  // Internal engine tables (not collections, no MCP tools)
  workflow_executions: {
    idempotent: postgresQueries.workflowExecutionTableIdempotentQuery,
    indexes: postgresQueries.workflowExecutionTableIndexesQuery,
  },
  execution_step_results: {
    idempotent: postgresQueries.executionStepResultsTableIdempotentQuery,
    indexes: postgresQueries.executionStepResultsTableIndexesQuery,
  },
  workflow_events: {
    idempotent: postgresQueries.workflowEventsTableIdempotentQuery,
    indexes: postgresQueries.workflowEventsTableIndexesQuery,
  },
};

async function ensureCollections(env: Env) {
  for (const collection of Object.values(collectionsQueries)) {
    try {
      await runSQL(env, collection.idempotent);
    } catch (error) {
      console.error(
        `Error ensuring collection ${collection.idempotent}`,
        error,
      );
      throw error;
    }
  }
}

async function ensureIndexes(env: Env) {
  for (const collection of Object.values(collectionsQueries)) {
    try {
      await runSQL(env, collection.indexes);
    } catch (error) {
      console.error(`Error ensuring indexes ${collection.indexes}`, error);
    }
  }
}

export { collectionsQueries, ensureCollections, ensureIndexes };
