/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";

// For Google Speech tools, we export them directly without mixing with userTools
// This MCP provides text-to-speech and speech-to-text capabilities through the API

// Re-export for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";

/**
 * Export all tools from all domains
 * Note: Google Speech MCP is API-only with no direct tools interface
 */
export const tools = [...userTools];
