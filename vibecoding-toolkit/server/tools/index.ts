/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { agentTools } from "./agent.ts";
import { workflowTools } from "../workflow/tools.ts";
import { workflowCollectionTools } from "./workflow.ts";
import { integrationsTools } from "./integrations.ts";

// Export all tools from all domains
export const tools = [
  ...agentTools,
  ...workflowTools,
  ...workflowCollectionTools,
  ...integrationsTools,
];

// Re-export domain-specific tools for direct access if needed
