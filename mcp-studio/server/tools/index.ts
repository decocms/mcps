import {
  workflowExecutionCollectionTools,
  workflowTools,
} from "./execution.ts";
import { promptTools } from "./prompt.ts";
import { workflowCollectionTools } from "./workflow.ts";

export const tools = [
  ...promptTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
];
