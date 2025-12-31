import { assistantTools } from "./assistant.ts";
import {
  workflowExecutionCollectionTools,
  workflowTools,
} from "./execution.ts";
import { promptTools } from "./prompt.ts";
import { workflowCollectionTools } from "./workflow.ts";

export const tools = [
  ...assistantTools,
  ...promptTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
