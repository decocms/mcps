/**
 * Event Handler
 *
 * Handles workflow-related events from the event bus.
 * All step executions are fire-and-forget - the event bus provides durability.
 */

import {
  handleExecutionCreated,
  handleStepCompleted,
  handleStepExecute,
} from "../engine/orchestrator.ts";
import type { Env } from "../types/env.ts";

interface WorkflowEvent {
  type: string;
  data?: unknown;
  subject?: string;
  id: string;
}

export const WORKFLOW_EVENTS = [
  "workflow.execution.created",
  "workflow.step.execute",
  "workflow.step.completed",
] as const;

/**
 * Handle a batch of workflow events.
 * Each event is processed independently - failures don't affect other events.
 */
export function handleWorkflowEvents(events: WorkflowEvent[], env: Env): void {
  for (const event of events) {
    if (!event.subject) continue;

    const executionId = event.subject;
    const data = event.data as Record<string, unknown> | undefined;

    switch (event.type) {
      case "workflow.execution.created":
        handleExecutionCreated(env, executionId).catch((error: Error) => {
          console.error(
            `[EVENT] workflow.execution.created failed for ${executionId}:`,
            error,
          );
        });
        break;

      case "workflow.step.execute":
        if (data?.stepName) {
          handleStepExecute(
            env,
            executionId,
            data.stepName as string,
            data.input as Record<string, unknown>,
          ).catch(async (error: Error) => {
            console.error(
              `[EVENT] workflow.step.execute failed for ${executionId}/${data.stepName}:`,
              error,
            );
            // Publish step.completed with error so workflow doesn't get stuck
            try {
              await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS?.EVENT_PUBLISH({
                type: "workflow.step.completed",
                subject: executionId,
                data: {
                  stepName: data.stepName,
                  error: error.message,
                },
              });
            } catch (publishError) {
              console.error(
                `[EVENT] Failed to publish step.completed error event:`,
                publishError,
              );
            }
          });
        }
        break;

      case "workflow.step.completed":
        if (data?.stepName) {
          handleStepCompleted(
            env,
            executionId,
            data.stepName as string,
            data.output,
            data.error as string | undefined,
          ).catch((error: Error) => {
            console.error(
              `[EVENT] workflow.step.completed failed for ${executionId}/${data.stepName}:`,
              error,
            );
          });
        }
        break;
    }
  }
}
