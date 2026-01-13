/**
 * Discord Client Module
 *
 * Initializes and manages the Discord.js client within the MCP server.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type Message,
  type MessageReaction,
  type User,
  type PartialMessageReaction,
  type PartialUser,
  type Interaction,
} from "discord.js";
import type { Env } from "../types/env.ts";
import { setDatabaseEnv } from "../../shared/db.ts";
import { getCurrentEnv, updateEnv } from "../bot-manager.ts";
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
import { agentCommand, handleAgentCommand } from "./commands/agent.ts";

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

  // Get bot token from state
  const token = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
  console.log("[Discord] BOT_TOKEN present:", !!token);

  if (!token) {
    const stateKeys = Object.keys(env.MESH_REQUEST_CONTEXT?.state || {});
    throw new Error(
      "[Discord] BOT_TOKEN not configured. Available keys: " +
        stateKeys.join(", "),
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
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
  });

  // Register event handlers
  registerEventHandlers(client, env);

  // Login
  await client.login(token);

  console.log(`[Discord] Logged in as ${client.user?.tag}`);

  // Register slash commands
  await registerSlashCommands(client, token, env);

  return client;
}

/**
 * Get the current Discord client instance.
 */
export function getDiscordClient(): Client | null {
  return client;
}

/**
 * Register slash commands with Discord
 */
async function registerSlashCommands(
  client: Client,
  token: string,
  env: Env,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);

  const commands = [agentCommand.toJSON()];

  try {
    const guildId = env.MESH_REQUEST_CONTEXT?.state?.GUILD_ID;

    if (guildId) {
      // Guild-specific commands (faster updates)
      await rest.put(
        Routes.applicationGuildCommands(client.user!.id, guildId),
        { body: commands },
      );
      console.log(`[Discord] Registered ${commands.length} guild commands`);
    } else {
      // Global commands
      await rest.put(Routes.applicationCommands(client.user!.id), {
        body: commands,
      });
      console.log(`[Discord] Registered ${commands.length} global commands`);
    }
  } catch (error) {
    console.error("[Discord] Failed to register slash commands:", error);
  }
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
  // Ready event (use 'clientReady' to avoid deprecation warning in v15)
  client.once("ready", () => {
    const prefix = env.MESH_REQUEST_CONTEXT?.state?.COMMAND_PREFIX || "!";
    console.log(`[Discord] Bot is ready!`);
    console.log(`[Discord] - Guilds: ${client.guilds.cache.size}`);
    console.log(`[Discord] - Command prefix: "${prefix}"`);
    console.log(`[Discord] - Listening for messages...`);
  });

  // Interaction (slash command) handler
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case "agent":
          await handleAgentCommand(interaction);
          break;
        default:
          console.log(`[Discord] Unknown command: ${interaction.commandName}`);
      }
    } catch (error) {
      console.error(`[Discord] Error handling interaction:`, error);
      const reply = {
        content: "Ocorreu um erro ao processar o comando.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });

  // Message create event
  client.on("messageCreate", async (message: Message) => {
    if (!message.guild) return; // Ignore DMs

    // CRITICAL: Debounce to prevent duplicate processing
    if (processedMessageIds.has(message.id)) {
      return; // Already processed this message
    }
    processedMessageIds.add(message.id);

    // Auto-cleanup after TTL
    setTimeout(() => processedMessageIds.delete(message.id), MESSAGE_CACHE_TTL);

    // Debug: log all messages
    console.log(
      `[Discord] Message received: "${message.content}" from ${message.author.username}`,
    );

    // Get the latest env (updated by tool calls from Mesh)
    const currentEnv = getCurrentEnv() || env;

    // Re-set database env (ensures it's available for this message)
    setDatabaseEnv(currentEnv);

    try {
      // Index the message (non-blocking, errors are logged but don't stop processing)
      indexMessage(message).catch((e) =>
        console.log("[Discord] Index failed (non-critical):", e.message),
      );

      // Check for command - accept both prefix and bot mention
      if (message.author.bot) return;

      const configuredPrefix =
        currentEnv.MESH_REQUEST_CONTEXT?.state?.COMMAND_PREFIX || "!";
      const botMention = `<@${client.user?.id}>`;
      const botMentionNick = `<@!${client.user?.id}>`; // Nickname mention format

      // Debug: show what we're looking for
      console.log(
        `[Discord] Looking for prefixes: "${botMention}" or "${botMentionNick}" or "${configuredPrefix}"`,
      );
      console.log(`[Discord] Message content: "${message.content}"`);

      let prefix: string | null = null;
      let content = message.content;

      // Check bot mention first (higher priority)
      if (content.startsWith(botMention)) {
        prefix = botMention;
        content = content.slice(botMention.length).trim();
        console.log(`[Discord] Matched bot mention: "${botMention}"`);
      } else if (content.startsWith(botMentionNick)) {
        prefix = botMentionNick;
        content = content.slice(botMentionNick.length).trim();
        console.log(
          `[Discord] Matched bot mention (nick): "${botMentionNick}"`,
        );
      } else if (content.startsWith(configuredPrefix)) {
        prefix = configuredPrefix;
        content = content.slice(configuredPrefix.length).trim();
        console.log(
          `[Discord] Matched configured prefix: "${configuredPrefix}"`,
        );
      } else {
        console.log(`[Discord] No prefix matched`);
      }

      if (prefix) {
        console.log(`[Discord] Command detected! Content: "${content}"`);
        // Pass the cleaned content without prefix (use currentEnv for latest context)
        await processCommand(message, prefix, currentEnv, content);
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
      await handleMessageDeleteBulk(messages);
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
