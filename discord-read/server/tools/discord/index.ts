/**
 * Discord Tools Index
 *
 * Exports all Discord API tools.
 */

export { discordAPI, encodeEmoji } from "./api.ts";
export { discordMessageTools } from "./messages.ts";
export { discordChannelTools } from "./channels.ts";
export { discordGuildTools } from "./guilds.ts";
export { discordWebhookTools } from "./webhooks.ts";

import type { Env } from "../../types/env.ts";
import { discordMessageTools } from "./messages.ts";
import { discordChannelTools } from "./channels.ts";
import { discordGuildTools } from "./guilds.ts";
import { discordWebhookTools } from "./webhooks.ts";

// Combined list of all Discord tools
type ToolFactory = (env: Env) => unknown;

export const allDiscordTools: ToolFactory[] = [
  ...discordMessageTools,
  ...discordChannelTools,
  ...discordGuildTools,
  ...discordWebhookTools,
];
