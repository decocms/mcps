import { agentTools } from "./agent.ts";
import { workflowTools } from "./workflow/tools.ts";
import { workflowCollectionTools } from "./workflow/workflow.ts";
import { workflowExecutionCollectionTools } from "./workflow/workflow-execution.ts";

export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
