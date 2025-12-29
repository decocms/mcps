import {
  workflowTools,
  workflowExecutionCollectionTools,
} from "./execution.ts";
import { workflowCollectionTools } from "./workflow.ts";
import { assistantTools } from "./assistant.ts";

export const tools = [
  ...assistantTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
