/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { storageTools } from "./storage.ts";
import { userTools } from "@decocms/mcps-shared/tools/user";

// Export all tools from all domains
export const tools = [...userTools, ...storageTools];

// Re-export domain-specific tools for direct access if needed
export { storageTools } from "./storage.ts";
export { userTools } from "@decocms/mcps-shared/tools/user";
