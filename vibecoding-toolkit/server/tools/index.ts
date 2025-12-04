import { agentTools } from "./agent.ts";
import { workflowTools } from "../workflow/tools.ts";
import { workflowCollectionTools } from "./workflow.ts";

export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
];
