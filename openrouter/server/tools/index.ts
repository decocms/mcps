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
 * - chatTools: Chat completions and streaming session management
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import {
  createListModelsTool,
  createGetModelTool,
  createCompareModelsTool,
  createRecommendModelTool,
} from "./models/index.ts";
import {
  createChatCompletionTool,
  createStartStreamTool,
} from "./chat/index.ts";

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
  createStartStreamTool,
];
