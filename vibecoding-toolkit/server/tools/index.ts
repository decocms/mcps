import { agentTools } from "./agent.ts";
import { workflowTools } from "./workflow/tools.ts";
import { workflowCollectionTools } from "./workflow/workflow.ts";
import { workflowExecutionCollectionTools } from "./workflow/workflow-execution.ts";
import { workflowExecutionStepResultsTools } from "./workflow/workflow-execution-step-results.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import { EVENT_SUBSCRIBER_BINDING } from "@decocms/bindings/event-subscriber";
import { WorkflowExecution } from "@decocms/bindings/workflow";
import { executeWorkflow } from "../workflow/executor.ts";
import type { Env } from "../main.ts";

const ON_EVENTS_BINDING = EVENT_SUBSCRIBER_BINDING.find(
  (binding) => binding.name === "ON_EVENTS",
);

if (!ON_EVENTS_BINDING) {
  throw new Error("ON_EVENTS binding not found");
}

const eventBusTools = [
  (env: Env) =>
    createPrivateTool({
      id: ON_EVENTS_BINDING.name,
      description: "Publish an event to the event bus",
      inputSchema: ON_EVENTS_BINDING.inputSchema,
      outputSchema: ON_EVENTS_BINDING.outputSchema,
      execute: async ({ context }) => {
        try {
          for (const event of context.events) {
            if (event.subject === "workflow.execution.created") {
              const execution = event.data as WorkflowExecution;
              console.log({ execution });
              executeWorkflow(env, execution.id).catch((error: Error) => {
                console.error(
                  `[EXECUTE_WORKFLOW] Error executing workflow: ${error}`,
                );
              });
            }
          }
          return {
            success: true,
          };
        } catch (error) {
          console.error(error);
          throw error;
        }
      },
    }),
];

export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...workflowExecutionCollectionTools,
  ...workflowExecutionStepResultsTools,
  ...eventBusTools,
];
