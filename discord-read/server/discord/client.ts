/**
 * Discord Client Module
 *
 * Initializes and manages the Discord.js client within the MCP server.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type MessageReaction,
  type User,
  type PartialMessageReaction,
  type PartialUser,
} from "discord.js";
import type { Env } from "../types/env.ts";
import { setDatabaseEnv } from "../../shared/db.ts";
import { getCurrentEnv, updateEnv } from "../bot-manager.ts";
import { getDiscordBotToken } from "../lib/env.ts";
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

let client: Client | null = null;
let eventsRegistered = false;
let initializingPromise: Promise<Client> | null = null;

// Debounce for message processing
const processedMessageIds = new Set<string>();
const MESSAGE_CACHE_TTL = 10000; // 10 seconds

/**
 * Initialize the Discord client with the given environment.
 */
export async function initializeDiscordClient(env: Env): Promise<Client> {
  // If already initializing, wait for it
  if (initializingPromise) {
    console.log("[Discord] Already initializing, waiting...");
    return initializingPromise;
  }

  // Check if already initialized and ready
  if (client?.isReady()) {
    console.log("[Discord] Client already initialized and ready");
    return client;
  }

  // If there's an existing client that's not ready, destroy it
  if (client) {
    console.log("[Discord] Destroying previous unready client...");
    client.destroy();
    client = null;
    eventsRegistered = false;
  }

  // Create promise to prevent concurrent initializations
  initializingPromise = (async () => {
    try {
      return await doInitialize(env);
    } finally {
      initializingPromise = null;
    }
  })();

  return initializingPromise;
}

async function doInitialize(env: Env): Promise<Client> {
  console.log("[Discord] Starting initialization...");

  // Set database environment for shared module
  setDatabaseEnv(env);

  // Get bot token from Authorization header
  let token: string;
  try {
    token = getDiscordBotToken(env);
    console.log("[Discord] Bot token retrieved from Authorization header");
  } catch (error) {
    console.error("[Discord] Failed to get bot token:", error);
    throw new Error(
      "Discord Bot Token not provided. Please add it in the Authorization section of the Mesh Dashboard.",
    );
  }

  // Create client with required intents
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates, // For voice channel features
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
  });

  // Set database env BEFORE registering handlers
  setDatabaseEnv(env);
  // Also update global env
  updateEnv(env);

  // Register event handlers
  registerEventHandlers(client, env);

  // Login and wait for ready
  await client.login(token);
  console.log(`[Discord] Logged in as ${client.user?.tag}`);

  // Wait for the client to be fully ready
  if (client && !client.isReady()) {
    console.log(`[Discord] Waiting for ready event...`);
    const c = client; // Capture reference for closure
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`[Discord] Ready timeout, continuing anyway...`);
        resolve();
      }, 10000); // 10 second timeout

      c.once("clientReady", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return client;
}

/**
 * Get the current Discord client instance.
 */
export function getDiscordClient(): Client | null {
  return client;
}

/**
 * Register all event handlers for the Discord client.
 */
function registerEventHandlers(client: Client, env: Env): void {
  // Prevent double registration
  if (eventsRegistered) {
    console.log("[Discord] Events already registered, skipping...");
    return;
  }
  eventsRegistered = true;
  console.log("[Discord] Registering event handlers...");
  // Ready event (use 'clientReady' for Discord.js v15+)
  client.once("clientReady", () => {
    const prefix = env.MESH_REQUEST_CONTEXT?.state?.COMMAND_PREFIX || "!";
    console.log(`[Discord] Bot is ready!`);
    console.log(`[Discord] - Guilds: ${client.guilds.cache.size}`);
    console.log(`[Discord] - Command prefix: "${prefix}"`);
    console.log(`[Discord] - Listening for messages...`);
  });

  // Message create event
  client.on("messageCreate", async (message: Message) => {
    const isDM = !message.guild;

    // CRITICAL: Debounce to prevent duplicate processing
    if (processedMessageIds.has(message.id)) {
      return; // Already processed this message
    }
    processedMessageIds.add(message.id);

    // Auto-cleanup after TTL
    setTimeout(() => processedMessageIds.delete(message.id), MESSAGE_CACHE_TTL);

    // Get the latest env (updated by tool calls from Mesh)
    const currentEnv = getCurrentEnv() || env;

    // Check if DMs are allowed
    if (isDM) {
      const allowDM =
        currentEnv.MESH_REQUEST_CONTEXT?.state?.ALLOW_DM !== false;
      if (!allowDM) {
        console.log(`[Discord] DM ignored (disabled in config)`);
        return;
      }

      // Check if user is allowed to DM
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

    // Removed verbose logging for better performance

    // Re-set database env (ensures it's available for this message)
    // Only set if we have a valid MESH_REQUEST_CONTEXT
    if (currentEnv.MESH_REQUEST_CONTEXT?.state?.DATABASE) {
      setDatabaseEnv(currentEnv);
    }

    try {
      // Index the message (non-blocking, errors are logged but don't stop processing)
      // Only index if database is configured
      if (currentEnv.MESH_REQUEST_CONTEXT?.state?.DATABASE) {
        indexMessage(message, isDM).catch((e) =>
          console.log("[Message] Failed to index:", e.message),
        );
      }

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
            // Don't respond - just silently ignore
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
        // Only fetch reply if no prefix matched (optimization)
        try {
          const repliedMsg = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          if (repliedMsg.author.id === client.user?.id) {
            prefix = "REPLY";
            content = message.content;
            replyToMessage = repliedMsg.content; // Get content while we have it
          }
        } catch {
          // Silently fail - reply detection is optional
        }
      }

      if (prefix) {
        await processCommand(
          message,
          prefix,
          currentEnv,
          content,
          isDM,
          replyToMessage,
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
      try {
        await handleReactionAdd(reaction, user);
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
      try {
        await handleReactionRemove(reaction, user);
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
    try {
      await handleMessageDelete(message);
    } catch (error) {
      console.error("[Discord] Error handling message delete:", error);
    }
  });

  // Bulk message delete event
  client.on("messageDeleteBulk", async (messages) => {
    try {
      // Convert ReadonlyCollection to Map for the handler
      const messagesMap = new Map(messages.entries());
      await handleMessageDeleteBulk(messagesMap);
    } catch (error) {
      console.error("[Discord] Error handling bulk message delete:", error);
    }
  });

  // Message update/edit event
  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    try {
      await handleMessageUpdate(oldMessage, newMessage);
    } catch (error) {
      console.error("[Discord] Error handling message update:", error);
    }
  });

  // Thread create event
  client.on("threadCreate", async (thread) => {
    if (!thread.guild) return;
    try {
      await handleThreadCreate(thread);
    } catch (error) {
      console.error("[Discord] Error handling thread create:", error);
    }
  });

  // Thread delete event
  client.on("threadDelete", async (thread) => {
    if (!thread.guild) return;
    try {
      await handleThreadDelete(thread);
    } catch (error) {
      console.error("[Discord] Error handling thread delete:", error);
    }
  });

  // Thread update event
  client.on("threadUpdate", async (oldThread, newThread) => {
    if (!newThread.guild) return;
    try {
      await handleThreadUpdate(newThread);
    } catch (error) {
      console.error("[Discord] Error handling thread update:", error);
    }
  });

  // Member join event
  client.on("guildMemberAdd", async (member) => {
    try {
      await handleMemberJoin(member);
    } catch (error) {
      console.error("[Discord] Error handling member join:", error);
    }
  });

  // Member leave event
  client.on("guildMemberRemove", async (member) => {
    try {
      await handleMemberLeave(member);
    } catch (error) {
      console.error("[Discord] Error handling member leave:", error);
    }
  });

  // Member update event
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      await handleMemberUpdate(newMember);
    } catch (error) {
      console.error("[Discord] Error handling member update:", error);
    }
  });

  // Channel create event
  client.on("channelCreate", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    try {
      await handleChannelCreate(channel);
    } catch (error) {
      console.error("[Discord] Error handling channel create:", error);
    }
  });

  // Channel delete event
  client.on("channelDelete", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    try {
      await handleChannelDelete(channel);
    } catch (error) {
      console.error("[Discord] Error handling channel delete:", error);
    }
  });

  // Error handling
  client.on("error", (error) => {
    console.error("[Discord] Client error:", error);
  });

  client.on("warn", (warning) => {
    console.warn("[Discord] Warning:", warning);
  });
}

/**
 * Shutdown the Discord client gracefully.
 */
export async function shutdownDiscordClient(): Promise<void> {
  if (client) {
    client.destroy();
    client = null;
    eventsRegistered = false; // Reset flag so events can be re-registered
    console.log("[Discord] Client shutdown");
  }
}

// ============================================================================
// Message Helpers for Streaming
// ============================================================================

/**
 * Send a "thinking" message that will be updated with the actual response.
 * Returns the message for later editing.
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
 * Used for streaming responses.
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
 * Update a thinking message with the actual response (or partial response during streaming).
 * Handles Discord's 2000 character limit by truncating if necessary.
 */
export async function updateThinkingMessage(
  thinkingMsg: Message,
  content: string,
  authorMention?: string,
): Promise<boolean> {
  try {
    // Add author mention if provided
    const fullContent = authorMention ? `${authorMention} ${content}` : content;

    // Discord has a 2000 character limit
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
 * Split long text into chunks that fit Discord's message limit.
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

    // Try to split at natural break points
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
