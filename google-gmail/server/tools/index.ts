/**
 * Central export point for all Gmail tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - messageTools: Message management (list, get, send, search, trash, delete, modify)
 * - threadTools: Thread management (list, get, trash, untrash, modify, delete)
 * - labelTools: Label management (list, get, create, update, delete)
 * - draftTools: Draft management (list, get, create, update, send, delete)
 */

import { messageTools } from "./messages.ts";
import { threadTools } from "./threads.ts";
import { labelTools } from "./labels.ts";
import { draftTools } from "./drafts.ts";

// Export all tools from all modules
export const tools = [
  // Message management tools
  ...messageTools,
  // Thread management tools
  ...threadTools,
  // Label management tools
  ...labelTools,
  // Draft management tools
  ...draftTools,
];
