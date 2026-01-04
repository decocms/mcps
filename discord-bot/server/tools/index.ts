/**
 * Central export point for all Discord Bot MCP tools.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */

import { userTools } from "@decocms/mcps-shared/tools/user";
import { messageTools } from "./messages.ts";
import { channelTools } from "./channels.ts";
import { guildTools } from "./guilds.ts";
import { roleTools } from "./roles.ts";
import { threadTools } from "./threads.ts";
import { webhookTools } from "./webhooks.ts";

/**
 * Export all tools from all domains
 *
 * Tools are organized by functionality:
 * - userTools: User authentication and profile tools
 * - messageTools: Message operations (send, edit, delete, reactions, pins)
 * - channelTools: Channel management
 * - guildTools: Server/guild and member management
 * - roleTools: Role management
 * - threadTools: Thread operations
 * - webhookTools: Webhook management
 */
export const tools = [
  ...userTools,
  ...messageTools,
  ...channelTools,
  ...guildTools,
  ...roleTools,
  ...threadTools,
  ...webhookTools,
];

// Re-export domain-specific tools for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
export { messageTools } from "./messages.ts";
export { channelTools } from "./channels.ts";
export { guildTools } from "./guilds.ts";
export { roleTools } from "./roles.ts";
export { threadTools } from "./threads.ts";
export { webhookTools } from "./webhooks.ts";
