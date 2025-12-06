import { agentTools } from "./agent.ts";
import { workflowTools } from "../workflow/tools.ts";
import { workflowCollectionTools } from "./workflow.ts";
import { workflowExecutionCollectionTools } from "./workflow-execution.ts";
import { workflowExecutionStepResultsTools } from "./workflow-execution-step-results.ts";

export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
  ...workflowExecutionStepResultsTools,
];
