/**
 * Tools Index
 *
 * Exports all tools available to the Pilot agent.
 */

export * from "./system.ts";
export * from "./speech.ts";

import { systemTools } from "./system.ts";
import { speechTools } from "./speech.ts";
import type { Tool } from "./system.ts";

/**
 * Task management tool specs (for validation)
 * These are implemented in workflow-executor.ts but need to be listed here
 * so validateWorkflowTools() knows they're available.
 */
const taskManagementTools: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [
  {
    name: "list_workflows",
    description: "List available workflows that can be executed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "execute_workflow",
    description: "Execute a workflow by ID.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        input: { type: "object" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "start_task",
    description: "Start a workflow as a new background task.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        input: { type: "object" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "check_task",
    description: "Check the status and progress of a task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "list_tasks",
    description: "List all tasks.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "delete_task",
    description: "Delete a task from history.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "NEW_THREAD",
    description: "Close the current conversation thread.",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Get all local tools
 */
export function getAllLocalTools(): Tool[] {
  // Task management tools don't have execute functions - they're handled by workflow-executor
  // But we need to include them for validation purposes
  const taskToolsAsTools = taskManagementTools.map((t) => ({
    ...t,
    execute: async () => ({
      content: [
        { type: "text" as const, text: "Handled by workflow-executor" },
      ],
    }),
  }));

  return [...systemTools, ...speechTools, ...taskToolsAsTools];
}
