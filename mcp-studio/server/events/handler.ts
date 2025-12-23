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

const WORKFLOW_EVENTS = [
  "workflow.execution.created",
  "workflow.execution.retry",
  "workflow.signal.sent",
] as const;

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
      case "workflow.execution.retry":
      case "workflow.signal.sent":
        executeWorkflow(env, event.subject);
        break;
    }
  }
}
