import { agentTools } from "./agent.ts";
import {
  workflowTools,
  workflowExecutionCollectionTools,
} from "./execution.ts";
import { workflowCollectionTools } from "./workflow.ts";

export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
