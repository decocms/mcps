import { agentTableIdempotentQuery, agentTableIndexesQuery } from "./agent";
import {
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,
} from "./workflow";

const collectionsQueries = {
  agents: {
    idempotent: agentTableIdempotentQuery,
    indexes: agentTableIndexesQuery,
  },
  workflows: {
    idempotent: workflowTableIdempotentQuery,
    indexes: workflowTableIndexesQuery,
  },
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
