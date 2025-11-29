/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { agentTools } from "./agent.ts";
import { workflowTools } from "../workflow/tools.ts";
import { workflowCollectionTools } from "./workflow.ts";

// Export all tools from all domains
export const tools = [
  ...userTools,
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
];

// Re-export domain-specific tools for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
