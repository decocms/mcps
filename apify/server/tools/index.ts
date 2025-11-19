/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import type { Env } from "server/main";
import { userTools } from "@decocms/mcps-shared/tools/user";
import { createApifyTools } from "./apify.ts";

/**
 * Factory function to create all tools with env context
 * Follows Sora pattern for dynamic tool creation with cleaner code
 */
export const createTools = (env: Env) => [
  ...userTools,
  ...createApifyTools(env),
];

// Re-export for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
export { createApifyTools } from "./apify.ts";
