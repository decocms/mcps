/**
 * Event Handler
 *
 * Handles workflow-related events from the event bus.
 */

import type { Env } from "../types/env.ts";
import { executeWorkflow } from "../workflow/executor.ts";

interface WorkflowEvent {
  type: string;
  data?: unknown;
  subject?: string;
  id: string;
}

const WORKFLOW_EVENTS = ["workflow.execution.created"] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENTS)[number];

export const workflowEventTypes = [...WORKFLOW_EVENTS];

/**
 * Handle a batch of workflow events.
 */
export function handleWorkflowEvents(events: WorkflowEvent[], env: Env): void {
  for (const event of events) {
    if (!event.subject) continue;

    switch (event.type) {
      case "workflow.execution.created":
        executeWorkflow(env, event.subject).catch((error: Error) => {
          console.error(`[EXECUTE_WORKFLOW] Error: ${error}`);
        });
        break;
    }
  }
}
