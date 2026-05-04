/**
 * Tool aggregator. Each tool factory is wrapped with updateEnv() so that
 * MESH_REQUEST_CONTEXT (auth, state, connectionId) stays fresh across calls.
 *
 * Phase 1: config + bot status. Later phases append messages, channels,
 * guilds, members, roles, moderation, webhooks, and interactions.
 */

import { updateEnv } from "../bot/manager.ts";
import type { Env } from "../types/env.ts";
import type { ToolFactory, ToolCollection } from "../types/tools.ts";
import { configTools } from "./config/index.ts";
import { botTools } from "./bot/index.ts";
import { interactionTools } from "./interactions/index.ts";
import { discordMessageTools } from "./messages/index.ts";
import { discordChannelTools } from "./channels/index.ts";
import { discordGuildTools } from "./guilds/index.ts";
import { discordWebhookTools } from "./webhooks/index.ts";
import { triggers } from "../triggers/store.ts";

function wrapWithEnvUpdate(toolFactory: ToolFactory<Env>): ToolFactory<Env> {
  return (env: Env) => {
    updateEnv(env);
    return toolFactory(env);
  };
}

const wrappedConfig = configTools.map(wrapWithEnvUpdate);
const wrappedBot = botTools.map(wrapWithEnvUpdate);
const wrappedInteractions = interactionTools.map(wrapWithEnvUpdate);
const wrappedMessages = discordMessageTools.map(wrapWithEnvUpdate);
const wrappedChannels = discordChannelTools.map(wrapWithEnvUpdate);
const wrappedGuilds = discordGuildTools.map(wrapWithEnvUpdate);
const wrappedWebhooks = discordWebhookTools.map(wrapWithEnvUpdate);

export const tools: ToolCollection<Env> = [
  ...wrappedConfig,
  ...wrappedBot,
  ...wrappedInteractions,
  ...wrappedMessages,
  ...wrappedChannels,
  ...wrappedGuilds,
  ...wrappedWebhooks,
  () => triggers.tools(),
];
