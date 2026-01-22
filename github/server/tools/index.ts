/**
 * GitHub Events MCP Tools
 *
 * Exports all tools available in this MCP.
 */

import {
  createListRepositoriesTool,
  createListWebhooksTool,
} from "./management.ts";
import { createGitHubWebhookTool } from "./webhook.ts";

/**
 * All tools for the GitHub Events MCP
 */
export const tools = [
  createGitHubWebhookTool,
  createListRepositoriesTool,
  createListWebhooksTool,
];
