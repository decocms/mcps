/**
 * Discord.js Gateway client — initialization, login, intents.
 *
 * One client per Mesh connectionId; instances sharing a bot_token share a
 * single client (the bootstrap dedup logic in main.ts handles that).
 *
 * Event handlers live in ./events.ts to keep this file focused on lifecycle.
 */

import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { Env } from "../types/env.ts";
import {
  getOrCreateInstance,
  getInstance,
  type BotInstance,
} from "./instance.ts";
import { registerEventHandlers } from "./events.ts";
import { getDiscordConfig } from "../lib/config-cache.ts";

function buildIntents(env: Env): number[] {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  const intents: number[] = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ];
  if (state?.ENABLE_PRESENCE_EVENTS) {
    intents.push(GatewayIntentBits.GuildPresences);
  }
  if (state?.ENABLE_TYPING_EVENTS) {
    intents.push(GatewayIntentBits.GuildMessageTyping);
    intents.push(GatewayIntentBits.DirectMessageTyping);
  }
  if (state?.ENABLE_VOICE_EVENTS) {
    intents.push(GatewayIntentBits.GuildVoiceStates);
  }
  return intents;
}

export function getGatewayClient(connectionId: string): Client | null {
  return getInstance(connectionId)?.client ?? null;
}

export async function initializeGateway(env: Env): Promise<Client> {
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
  const instance = getOrCreateInstance(connectionId, env);

  if (instance.initializingPromise) return instance.initializingPromise;
  if (instance.client?.isReady()) return instance.client;

  if (instance.client) {
    try {
      instance.client.removeAllListeners();
      instance.client.destroy();
    } catch {
      // ignore destroy errors
    }
    instance.client = null;
  }

  instance.initializingPromise = (async () => {
    try {
      return await doInitialize(instance, env);
    } finally {
      instance.initializingPromise = null;
    }
  })();

  return instance.initializingPromise;
}

async function doInitialize(instance: BotInstance, env: Env): Promise<Client> {
  instance.env = env;

  const token = await resolveBotToken(env);
  if (!token) {
    throw new Error(`No bot token available for ${instance.connectionId}`);
  }

  const client = new Client({
    intents: buildIntents(env),
    partials: [
      Partials.Message,
      Partials.Reaction,
      Partials.User,
      Partials.Channel,
      Partials.GuildMember,
      Partials.ThreadMember,
    ],
  });

  instance.client = client;
  registerEventHandlers(client, instance);

  await client.login(token);

  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 10000);
      client.once("clientReady", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return client;
}

async function resolveBotToken(env: Env): Promise<string | null> {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization;
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1];
    return auth;
  }

  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return null;

  const config = await getDiscordConfig(connectionId).catch(() => null);
  return config?.botToken ?? null;
}

export async function shutdownGateway(connectionId: string): Promise<void> {
  const instance = getInstance(connectionId);
  if (instance?.client) {
    instance.client.removeAllListeners();
    instance.client.destroy();
    instance.client = null;
  }
}
