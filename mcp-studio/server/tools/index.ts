import {
  workflowTools,
  workflowExecutionCollectionTools,
} from "./execution.ts";
import { workflowCollectionTools } from "./workflow.ts";
import { assistantTools } from "./assistant.ts";
import { promptTools } from "./prompt.ts";

export const tools = [
  ...assistantTools,
  ...promptTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
