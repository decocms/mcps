/**
 * Discord Client Module
 *
 * Initializes and manages Discord.js clients per connection (multi-tenant).
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type MessageReaction,
  type User,
  type GuildMember,
  type PartialMessageReaction,
  type PartialUser,
} from "discord.js";
import type { Env } from "../types/env.ts";
import { setDatabaseEnv } from "../../shared/db.ts";
import {
  publishMessageCreated,
  publishMessageDeleted,
  publishMessageUpdated,
  publishMemberJoined,
  publishMemberLeft,
  publishMemberRoleAdded,
  publishMemberRoleRemoved,
  publishReactionAdded,
  publishReactionRemoved,
  publishThreadCreated,
  publishThreadDeleted,
  publishThreadUpdated,
  publishChannelCreated,
  publishChannelDeleted,
} from "../lib/event-publisher.ts";
import {
  indexMessage,
  processCommand,
  handleMessageDelete,
  handleMessageDeleteBulk,
  handleMessageUpdate,
} from "./handlers/messageHandler.ts";
import {
  handleThreadCreate,
  handleThreadDelete,
  handleThreadUpdate,
  handleChannelCreate,
  handleChannelDelete,
} from "./handlers/channelHandler.ts";
import {
  handleMemberJoin,
  handleMemberLeave,
  handleMemberUpdate,
} from "./handlers/memberHandler.ts";
import {
  handleReactionAdd,
  handleReactionRemove,
  handleReactionRemoveAll,
  handleReactionRemoveEmoji,
} from "./handlers/reactionHandler.ts";
import {
  getOrCreateInstance,
  getInstance,
  type BotInstance,
} from "../bot-instance.ts";

// Debounce TTLs
const MESSAGE_CACHE_TTL = 10000; // 10 seconds
const AUTO_RESPOND_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a channel has auto_respond enabled (with per-instance caching)
 */
async function isAutoRespondChannel(
  instance: BotInstance,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const cacheKey = `${guildId}:${channelId}`;
  const cached = instance.autoRespondCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < AUTO_RESPOND_CACHE_TTL) {
    return cached.autoRespond;
  }

  try {
    const db = await import("../../shared/db.ts");
    const channelContext = await db.getChannelContext(guildId, channelId);
    const autoRespond = channelContext?.auto_respond ?? false;

    instance.autoRespondCache.set(cacheKey, {
      autoRespond,
      timestamp: Date.now(),
    });

    return autoRespond;
  } catch {
    return false;
  }
}

/**
 * Invalidate auto_respond cache for a channel on a specific connection
 */
export function invalidateAutoRespondCache(
  connectionId: string,
  guildId: string,
  channelId: string,
): void {
  const instance = getInstance(connectionId);
  if (instance) {
    const cacheKey = `${guildId}:${channelId}`;
    instance.autoRespondCache.delete(cacheKey);
  }
}

/**
 * Get the Discord client for a specific connection.
 */
export function getDiscordClient(connectionId: string): Client | null {
  return getInstance(connectionId)?.client ?? null;
}

/**
 * Initialize the Discord client for a connection.
 */
export async function initializeDiscordClient(env: Env): Promise<Client> {
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
  const instance = getOrCreateInstance(connectionId, env);

  console.log(
    `[Discord] initializeDiscordClient called for connection: ${connectionId}`,
  );

  // If already initializing, wait for it
  if (instance.initializingPromise) {
    console.log(`[Discord] Already initializing ${connectionId}, waiting...`);
    return instance.initializingPromise;
  }

  // Check if already initialized and ready
  if (instance.client?.isReady()) {
    console.log(
      `[Discord] Client already ready for ${connectionId} (guilds: ${instance.client.guilds.cache.size})`,
    );
    return instance.client;
  }

  // If there's an existing client that's not ready, destroy it
  if (instance.client) {
    console.log(
      `[Discord] Destroying previous unready client for ${connectionId}...`,
    );
    try {
      instance.client.removeAllListeners();
      instance.client.destroy();
    } catch (error) {
      console.error("[Discord] Error destroying client:", error);
    }
    instance.client = null;
  }

  // Create promise to prevent concurrent initializations
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
  const connectionId = instance.connectionId;
  console.log(`[Discord] Starting initialization for ${connectionId}...`);

  // Set database environment for shared module
  setDatabaseEnv(env);
  instance.env = env;

  // Load config from Supabase
  console.log(
    `[Discord] Looking for saved config for connection: ${connectionId}`,
  );

  const { getDiscordConfig } = await import("../lib/config-cache.ts");
  const savedConfig = await getDiscordConfig(connectionId).catch(() => null);

  if (!savedConfig?.botToken) {
    throw new Error(
      `Discord Bot Token not configured for connection '${connectionId}'. ` +
        "Please use DISCORD_SAVE_CONFIG to save your bot token first.",
    );
  }

  const token = savedConfig.botToken;
  console.log(
    `[Discord] Bot token loaded from Supabase config for ${connectionId}`,
  );
  console.log(
    `[Discord] Authorized guilds: ${savedConfig.authorizedGuilds?.length || "all"}`,
  );

  // Create client with required intents
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
  });

  instance.client = client;

  // Set database env BEFORE registering handlers
  setDatabaseEnv(env);

  // Register event handlers scoped to this instance
  registerEventHandlers(client, instance);

  // Login and wait for ready
  await client.login(token);
  console.log(
    `[Discord] Logged in as ${client.user?.tag} for connection ${connectionId}`,
  );

  // Wait for the client to be fully ready
  if (!client.isReady()) {
    console.log(`[Discord] Waiting for ready event (${connectionId})...`);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log(
          `[Discord] Ready timeout for ${connectionId}, continuing anyway...`,
        );
        resolve();
      }, 10000);

      client.once("clientReady", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return client;
}

/**
 * Register all event handlers for a Discord client, scoped to a BotInstance.
 */
function registerEventHandlers(client: Client, instance: BotInstance): void {
  const connectionId = instance.connectionId;

  // CRITICAL: Remove ALL existing listeners to prevent duplicates on hot reload
  client.removeAllListeners();

  console.log(
    `[Discord] Registering event handlers for connection ${connectionId}...`,
  );

  // Ready event
  client.once("clientReady", () => {
    const prefix =
      instance.env.MESH_REQUEST_CONTEXT?.state?.COMMAND_PREFIX || "!";
    console.log(`[Discord] Bot is ready! (${connectionId})`);
    console.log(`[Discord] - Guilds: ${client.guilds.cache.size}`);
    console.log(`[Discord] - Command prefix: "${prefix}"`);
    console.log(`[Discord] - Listening for messages...`);
  });

  // Message create event
  client.on("messageCreate", async (message: Message) => {
    const isDM = !message.guild;

    // CRITICAL: Debounce to prevent duplicate processing (per-instance)
    if (instance.processedMessageIds.has(message.id)) {
      return;
    }
    instance.processedMessageIds.add(message.id);
    setTimeout(
      () => instance.processedMessageIds.delete(message.id),
      MESSAGE_CACHE_TTL,
    );

    // Use this instance's env (not a global)
    const currentEnv = instance.env;

    // Check if DMs are allowed
    if (isDM) {
      const allowDM =
        currentEnv.MESH_REQUEST_CONTEXT?.state?.ALLOW_DM !== false;
      if (!allowDM) {
        console.log(`[Discord] DM ignored (disabled in config)`);
        return;
      }

      const dmAllowedUsers =
        currentEnv.MESH_REQUEST_CONTEXT?.state?.DM_ALLOWED_USERS;
      if (dmAllowedUsers) {
        const allowedIds = dmAllowedUsers
          .split(",")
          .map((id: string) => id.trim());
        if (!allowedIds.includes(message.author.id)) {
          console.log(
            `[Discord] DM from ${message.author.username} not in allowed list`,
          );
          await message.reply(
            "❌ Você não tem permissão para usar o bot via DM.",
          );
          return;
        }
      }
    }

    // Re-set database env
    setDatabaseEnv(currentEnv);

    try {
      // Index message (async, fire-and-forget)
      console.log(
        `[Message] Indexing message ${message.id} from ${message.author.username}`,
      );
      indexMessage(message, isDM)
        .then(() => console.log(`[Message] Indexed message ${message.id}`))
        .catch((e) =>
          console.log(`[Message] Failed to index ${message.id}:`, e.message),
        );

      // Publish message.created event via triggers
      publishMessageCreated(currentEnv, message);

      // Check for command - accept both prefix and bot mention
      if (message.author.bot) return;

      // Check role permissions (only in guild)
      if (!isDM && message.member) {
        const allowedRoles =
          currentEnv.MESH_REQUEST_CONTEXT?.state?.ALLOWED_ROLES;
        if (allowedRoles) {
          const roleIds = allowedRoles
            .split(",")
            .map((id: string) => id.trim());
          const memberRoles = message.member.roles.cache.map((r) => r.id);
          const hasPermission = roleIds.some((roleId: string) =>
            memberRoles.includes(roleId),
          );
          if (!hasPermission) {
            console.log(
              `[Discord] User ${message.author.username} doesn't have required roles`,
            );
            return;
          }
        }
      }

      // Check prefixes first (faster) before fetching reply message
      const configuredPrefix =
        currentEnv.MESH_REQUEST_CONTEXT?.state?.COMMAND_PREFIX || "!";
      const botMention = `<@${client.user?.id}>`;
      const botMentionNick = `<@!${client.user?.id}>`;
      let prefix: string | null = null;
      let content = message.content;
      let replyToMessage: string | undefined;

      // Fast prefix checks (no async needed)
      if (isDM) {
        prefix = "DM";
      } else if (content.startsWith(botMention)) {
        prefix = botMention;
        content = content.slice(botMention.length).trim();
      } else if (content.startsWith(botMentionNick)) {
        prefix = botMentionNick;
        content = content.slice(botMentionNick.length).trim();
      } else if (content.startsWith(configuredPrefix)) {
        prefix = configuredPrefix;
        content = content.slice(configuredPrefix.length).trim();
      } else if (message.reference?.messageId) {
        try {
          const repliedMsg = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          if (repliedMsg.author.id === client.user?.id) {
            prefix = "REPLY";
            content = message.content;
            replyToMessage = repliedMsg.content;
          }
        } catch {
          // Silently fail - reply detection is optional
        }
      }

      // Check for auto_respond channel (no mention/prefix needed)
      if (!prefix && !isDM && message.guild?.id) {
        const autoRespond = await isAutoRespondChannel(
          instance,
          message.guild.id,
          message.channel.id,
        );
        if (autoRespond) {
          prefix = "AUTO_RESPOND";
          content = message.content;
          console.log(
            `[Discord] Auto-respond channel detected: ${message.channel.id}`,
          );
        }
      }

      if (prefix) {
        console.log(
          `[Discord] Processing command from ${message.author.username} (connection: ${connectionId})`,
        );
        await processCommand(
          message,
          prefix,
          currentEnv,
          content,
          isDM,
          replyToMessage,
          connectionId,
        );
      }
    } catch (error) {
      console.error("[Discord] Error handling message:", error);
    }
  });

  // Reaction add event
  client.on(
    "messageReactionAdd",
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      if (!reaction.message.guild) return;
      const currentEnv = instance.env;
      try {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();

        await handleReactionAdd(reaction, user);

        if (!reaction.partial && !user.partial) {
          publishReactionAdded(
            currentEnv,
            reaction as MessageReaction,
            user as User,
          );
        }
      } catch (error) {
        console.error("[Discord] Error handling reaction add:", error);
      }
    },
  );

  // Reaction remove event
  client.on(
    "messageReactionRemove",
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      if (!reaction.message.guild) return;
      const currentEnv = instance.env;
      try {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();

        await handleReactionRemove(reaction, user);

        if (!reaction.partial && !user.partial) {
          publishReactionRemoved(
            currentEnv,
            reaction as MessageReaction,
            user as User,
          );
        }
      } catch (error) {
        console.error("[Discord] Error handling reaction remove:", error);
      }
    },
  );

  // All reactions removed event
  client.on("messageReactionRemoveAll", async (message) => {
    if (!message.guild) return;
    try {
      await handleReactionRemoveAll(message.id);
    } catch (error) {
      console.error("[Discord] Error handling reaction remove all:", error);
    }
  });

  // Specific emoji reaction removed event
  client.on(
    "messageReactionRemoveEmoji",
    async (reaction: MessageReaction | PartialMessageReaction) => {
      if (!reaction.message.guild) return;
      try {
        await handleReactionRemoveEmoji(reaction);
      } catch (error) {
        console.error("[Discord] Error handling reaction remove emoji:", error);
      }
    },
  );

  // Message delete event
  client.on("messageDelete", async (message) => {
    if (!message.guild) return;
    const currentEnv = instance.env;
    try {
      await handleMessageDelete(message);
      if (!message.partial) {
        publishMessageDeleted(currentEnv, message as Message);
      }
    } catch (error) {
      console.error("[Discord] Error handling message delete:", error);
    }
  });

  // Bulk message delete event
  client.on("messageDeleteBulk", async (messages) => {
    try {
      const messagesMap = new Map(messages.entries());
      await handleMessageDeleteBulk(messagesMap);
    } catch (error) {
      console.error("[Discord] Error handling bulk message delete:", error);
    }
  });

  // Message update/edit event
  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    const currentEnv = instance.env;
    try {
      await handleMessageUpdate(oldMessage, newMessage);
      if (oldMessage.partial) await oldMessage.fetch();
      if (newMessage.partial) await newMessage.fetch();
      if (!oldMessage.partial && !newMessage.partial) {
        publishMessageUpdated(
          currentEnv,
          oldMessage as Message,
          newMessage as Message,
        );
      }
    } catch (error) {
      console.error("[Discord] Error handling message update:", error);
    }
  });

  // Thread create event
  client.on("threadCreate", async (thread) => {
    if (!thread.guild) return;
    const currentEnv = instance.env;
    try {
      await handleThreadCreate(thread);
      publishThreadCreated(currentEnv, thread);
    } catch (error) {
      console.error("[Discord] Error handling thread create:", error);
    }
  });

  // Thread delete event
  client.on("threadDelete", async (thread) => {
    if (!thread.guild) return;
    const currentEnv = instance.env;
    try {
      await handleThreadDelete(thread);
      publishThreadDeleted(currentEnv, thread);
    } catch (error) {
      console.error("[Discord] Error handling thread delete:", error);
    }
  });

  // Thread update event
  client.on("threadUpdate", async (oldThread, newThread) => {
    if (!newThread.guild) return;
    const currentEnv = instance.env;
    try {
      await handleThreadUpdate(newThread);
      publishThreadUpdated(currentEnv, oldThread, newThread);
    } catch (error) {
      console.error("[Discord] Error handling thread update:", error);
    }
  });

  // Member join event
  client.on("guildMemberAdd", async (member) => {
    const currentEnv = instance.env;
    try {
      await handleMemberJoin(member);
      publishMemberJoined(currentEnv, member);
    } catch (error) {
      console.error("[Discord] Error handling member join:", error);
    }
  });

  // Member leave event
  client.on("guildMemberRemove", async (member) => {
    const currentEnv = instance.env;
    try {
      await handleMemberLeave(member);
      if (!member.partial) {
        publishMemberLeft(currentEnv, member as GuildMember);
      }
    } catch (error) {
      console.error("[Discord] Error handling member leave:", error);
    }
  });

  // Member update event
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const currentEnv = instance.env;
    try {
      await handleMemberUpdate(newMember);

      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      newRoles.forEach((role) => {
        if (!oldRoles.has(role.id)) {
          publishMemberRoleAdded(currentEnv, newMember, role.id, role.name);
        }
      });

      oldRoles.forEach((role) => {
        if (!newRoles.has(role.id)) {
          publishMemberRoleRemoved(currentEnv, newMember, role.id, role.name);
        }
      });
    } catch (error) {
      console.error("[Discord] Error handling member update:", error);
    }
  });

  // Channel create event
  client.on("channelCreate", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const currentEnv = instance.env;
    try {
      await handleChannelCreate(channel);
      publishChannelCreated(currentEnv, channel);
    } catch (error) {
      console.error("[Discord] Error handling channel create:", error);
    }
  });

  // Channel delete event
  client.on("channelDelete", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const currentEnv = instance.env;
    try {
      await handleChannelDelete(channel);
      publishChannelDeleted(currentEnv, channel);
    } catch (error) {
      console.error("[Discord] Error handling channel delete:", error);
    }
  });

  // Error handling
  client.on("error", (error) => {
    console.error(`[Discord] Client error (${connectionId}):`, error);
  });

  client.on("warn", (warning) => {
    console.warn(`[Discord] Warning (${connectionId}):`, warning);
  });
}

/**
 * Shutdown the Discord client for a specific connection.
 */
export async function shutdownDiscordClient(
  connectionId: string,
): Promise<void> {
  const instance = getInstance(connectionId);
  if (instance?.client) {
    instance.client.removeAllListeners();
    instance.client.destroy();
    instance.client = null;
    console.log(`[Discord] Client shutdown for ${connectionId}`);
  }
}

// ============================================================================
// Message Helpers for Streaming
// ============================================================================

/**
 * Send a "thinking" message that will be updated with the actual response.
 */
export async function sendThinkingMessage(
  message: Message,
): Promise<Message | null> {
  try {
    const channel = message.channel;
    if (!("send" in channel)) {
      console.error("[Discord] Channel does not support sending messages");
      return null;
    }

    const thinkingMsg = await channel.send({
      content: `<@${message.author.id}> 🤔 Pensando...`,
    });

    return thinkingMsg;
  } catch (error) {
    console.error("[Discord] Failed to send thinking message:", error);
    return null;
  }
}

/**
 * Edit an existing message with new content.
 */
export async function editMessage(
  message: Message,
  content: string,
): Promise<boolean> {
  try {
    await message.edit({ content });
    return true;
  } catch (error) {
    console.error("[Discord] Failed to edit message:", error);
    return false;
  }
}

/**
 * Update a thinking message with the actual response.
 * Handles Discord's 2000 character limit.
 */
export async function updateThinkingMessage(
  thinkingMsg: Message,
  content: string,
  authorMention?: string,
): Promise<boolean> {
  try {
    const fullContent = authorMention ? `${authorMention} ${content}` : content;
    const maxLength = 2000;
    const truncatedContent =
      fullContent.length > maxLength
        ? fullContent.slice(0, maxLength - 3) + "..."
        : fullContent;

    await thinkingMsg.edit({ content: truncatedContent });
    return true;
  } catch (error) {
    console.error("[Discord] Failed to update thinking message:", error);
    return false;
  }
}

/**
 * Split a long message into chunks respecting Discord's character limit.
 */
export function splitMessage(text: string, maxLength: number = 2000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}
