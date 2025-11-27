/**
 * Central export point for all tools organized by feature modules.
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the modular organization.
 *
 * Modules:
 * - userTools: Standard user management tools (from shared)
 * - modelTools: Model discovery, comparison, and recommendations
 * - chatTools: Chat completions
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { createChatCompletionTool } from "./chat/index.ts";
import { streamText } from "./chat/streamText.ts";
import {
  createCompareModelsTool,
  createGetModelTool,
  createListModelsTool,
  createRecommendModelTool,
} from "./models/index.ts";

// Export all tools from all modules
export const tools = [
  ...userTools,
  // Models Module
  createListModelsTool,
  createGetModelTool,
  createCompareModelsTool,
  createRecommendModelTool,
  // Chat Module
  createChatCompletionTool,
  streamText,
  // Note: Stream endpoint info is now included in each model via DECO_COLLECTION_MODELS_GET
];
