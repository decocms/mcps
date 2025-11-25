/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";

// Import tool creators
import { createRunModelTool } from "./run-model.ts";
import { createGetPredictionTool } from "./get-prediction.ts";
import { createCancelPredictionTool } from "./cancel-prediction.ts";
import { createListModelsTool } from "./list-models.ts";
import { createGetModelTool } from "./get-model.ts";

// Export all tools from all domains
export const tools = [
  ...userTools,
  createRunModelTool,
  createGetPredictionTool,
  createCancelPredictionTool,
  createListModelsTool,
  createGetModelTool,
];

// Re-export domain-specific tools for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
