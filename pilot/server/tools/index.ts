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
 * Workflow/execution tool specs (for validation)
 * These are implemented in llm-executor.ts but need to be listed here
 * so tool validation knows they're available.
 */
const workflowTools: Array<{
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
    name: "start_workflow",
    description: "Start a workflow by ID.",
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
    name: "NEW_THREAD",
    description: "Start a new conversation thread.",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Get all local tools
 */
export function getAllLocalTools(): Tool[] {
  // Workflow tools don't have execute functions - they're handled by llm-executor
  // But we need to include them for validation purposes
  const workflowToolsAsTools = workflowTools.map((t) => ({
    ...t,
    execute: async () => ({
      content: [{ type: "text" as const, text: "Handled by llm-executor" }],
    }),
  }));

  return [...systemTools, ...speechTools, ...workflowToolsAsTools];
}
