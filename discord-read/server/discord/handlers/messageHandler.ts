/**
 * Message Handler
 *
 * Handles message indexing and AI agent processing.
 * All interactions are via natural language - no built-in commands.
 */

import {
  type Message,
  type TextChannel,
  type MessageCreateOptions,
} from "discord.js";
import type { Env } from "../../types/env.ts";

// Super Admins - always have full permissions everywhere
const SUPER_ADMINS = [
  "607266543859925014", // Jonas (dev)
];

// Track processed messages to prevent duplicates
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 100;

// Cache for channel context (LRU - keeps last 1000 channels)
// Channel prompts rarely change, so we cache aggressively
interface CachedChannelContext {
  prompt: string;
  timestamp: number;
}
const channelContextCache = new Map<string, CachedChannelContext>();
const MAX_CACHE_SIZE = 1000; // Increased from 50 - channel prompts rarely change
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (was 5 minutes)

/**
 * Check if a user is a super admin
 */
export function isSuperAdmin(userId: string): boolean {
  return SUPER_ADMINS.includes(userId);
}

/**
 * Get cached channel context or fetch from DB
 */
async function getCachedChannelContext(
  guildId: string,
  channelId: string,
): Promise<string | undefined> {
  const cacheKey = `${guildId}:${channelId}`;
  const cached = channelContextCache.get(cacheKey);

  // Check if cache is valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.prompt;
  }

  // Fetch from DB
  try {
    const db = await import("../../../shared/db.ts");
    const channelContext = await db.getChannelContext(guildId, channelId);
    const prompt = channelContext?.system_prompt;

    // Update cache (with LRU eviction)
    if (channelContextCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = channelContextCache.keys().next().value;
      if (firstKey) channelContextCache.delete(firstKey);
    }

    if (prompt) {
      channelContextCache.set(cacheKey, {
        prompt,
        timestamp: Date.now(),
      });
    } else {
      // Cache empty result too (to avoid repeated DB calls)
      channelContextCache.set(cacheKey, {
        prompt: "",
        timestamp: Date.now(),
      });
    }

    return prompt;
  } catch (e) {
    console.log(`[Agent] Could not fetch channel context:`, e);
    return undefined;
  }
}

/**
 * Invalidate channel context cache (call when prompt is updated)
 */
export function invalidateChannelContextCache(
  guildId: string,
  channelId: string,
): void {
  const cacheKey = `${guildId}:${channelId}`;
  channelContextCache.delete(cacheKey);
}

/**
 * Safe reply helper - uses channel.send if reply fails
 */
async function safeReply(
  message: Message,
  content: string | MessageCreateOptions,
): Promise<void> {
  try {
    const channel = message.channel;
    if (!("send" in channel)) {
      console.error("[Message] Channel does not support sending messages");
      return;
    }

    if (typeof content === "string") {
      await channel.send(`<@${message.author.id}> ${content}`);
    } else {
      await channel.send({
        ...content,
        content: `<@${message.author.id}> ${content.content || ""}`.trim(),
      });
    }
  } catch (error) {
    console.error("[Message] Error sending message:", error);
  }
}

/**
 * Index a message to the database.
 */
export async function indexMessage(
  message: Message,
  isDM: boolean = false,
): Promise<void> {
  try {
    const db = await import("../../../shared/db.ts");

    // Upsert guild first (only if not DM)
    if (message.guild) {
      await db.upsertGuild({
        id: message.guild.id,
        name: message.guild.name,
        icon: message.guild.iconURL(),
        owner_id: message.guild.ownerId,
      });
    }

    // Get channel info for type and parent
    const channel = message.channel;
    const isThread = "isThread" in channel && channel.isThread();
    const parentId = isThread ? channel.parentId : null;
    const categoryId =
      "parentId" in channel && !isThread ? channel.parentId : null;

    // Index the message with all available data
    await db.upsertMessage({
      id: message.id,
      guild_id: message.guild?.id || null,
      channel_id: message.channel.id,
      channel_name: isDM
        ? `DM-${message.author.username}`
        : (message.channel as TextChannel).name || null,
      channel_type: channel.type,
      parent_channel_id: parentId || categoryId || null,
      thread_id: isThread ? channel.id : message.thread?.id || null,
      is_dm: isDM,
      author_id: message.author.id,
      author_username: message.author.username,
      author_global_name: message.author.globalName || null,
      author_avatar: message.author.displayAvatarURL(),
      author_bot: message.author.bot,
      content: message.content,
      content_clean: message.cleanContent,
      type: message.type,
      pinned: message.pinned,
      tts: message.tts,
      flags: message.flags?.bitfield || 0,
      webhook_id: message.webhookId || null,
      application_id: message.applicationId || null,
      interaction: message.interaction
        ? {
            id: message.interaction.id,
            type: message.interaction.type,
            name: message.interaction.commandName,
            user_id: message.interaction.user.id,
          }
        : null,
      mention_everyone: message.mentions.everyone,
      mention_users: message.mentions.users.map((u) => u.id),
      mention_roles: message.mentions.roles.map((r) => r.id),
      mention_channels: message.mentions.channels.map((c) => c.id),
      attachments: message.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        contentType: a.contentType,
        size: a.size,
      })),
      embeds: message.embeds.map((e) => ({
        title: e.title,
        description: e.description,
        url: e.url,
        color: e.color,
      })),
      stickers: message.stickers.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
      })),
      components: message.components.map((c) => c.toJSON()),
      reply_to_id: message.reference?.messageId || null,
      message_reference: message.reference
        ? {
            message_id: message.reference.messageId,
            channel_id: message.reference.channelId,
            guild_id: message.reference.guildId,
          }
        : null,
      deleted: false,
      created_at: message.createdAt,
      edited_at: message.editedAt,
    });

    // Indexed successfully (removed log for performance)
  } catch (error) {
    // Don't crash if indexing fails - just log
    console.error(`[Message] Failed to index:`, error);
  }
}

/**
 * Process a message - sends directly to AI agent.
 * All interactions are via natural language.
 *
 * @param message - The Discord message
 * @param prefix - The prefix used (for logging)
 * @param env - Environment
 * @param cleanContent - Content without prefix
 * @param isDM - Whether this is a DM
 * @param replyToMessage - Content of the bot's message being replied to (if any)
 */
export async function processCommand(
  message: Message,
  prefix: string,
  env: Env,
  cleanContent?: string,
  isDM: boolean = false,
  replyToMessage?: string,
): Promise<void> {
  // In guilds, we need member info; in DMs, we don't have it
  if (!isDM && (!message.guild || !message.member)) return;

  // Prevent duplicate processing
  const messageKey = `${message.id}-${message.channelId}`;
  if (processedMessages.has(messageKey)) {
    return;
  }
  processedMessages.add(messageKey);

  // Cleanup old entries if cache is too large
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    const entries = Array.from(processedMessages);
    entries
      .slice(0, entries.length - MAX_PROCESSED_CACHE)
      .forEach((e) => processedMessages.delete(e));
  }

  // Get the user input
  const userInput = cleanContent ?? message.content.trim();
  if (!userInput) return;

  // Send directly to AI agent
  await handleDefaultAgent(message, userInput, env, replyToMessage);
}

/**
 * Handle default agent - sends message directly to Mesh AI Agent
 * This is called for any message that isn't a built-in command
 */
async function handleDefaultAgent(
  message: Message,
  userInput: string,
  env: Env,
  replyToMessage?: string,
): Promise<void> {
  const isDM = !message.guild;

  // Empty input
  if (!userInput.trim()) {
    await safeReply(message, "👋 Olá! Como posso ajudar você hoje?");
    return;
  }

  // Note: We don't block here based on session status anymore.
  // The LLM call will fail with a clear error if the session is expired,
  // and that error is already handled in the catch block below.

  // Removed verbose logging for better performance

  // Show typing indicator with continuous loop (Discord typing expires after ~10s)
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = async () => {
    try {
      if ("sendTyping" in message.channel) {
        await message.channel.sendTyping();
      }
    } catch {}
  };

  // Start typing immediately and keep it active every 8 seconds
  await startTyping();
  typingInterval = setInterval(startTyping, 8000);

  try {
    // Import modules in parallel
    const [{ generateResponse }, { getSystemPrompt }] = await Promise.all([
      import("../../llm.ts"),
      import("../../prompts/system.ts"),
    ]);

    const startTime = Date.now();
    const channelName =
      "name" in message.channel
        ? (message.channel.name ?? undefined)
        : undefined;

    // Fetch context and channel prompt in parallel
    const [contextMessages, channelPrompt] = await Promise.all([
      // Fetch last 10 messages from channel for context
      (async () => {
        try {
          const messages = await message.channel.messages.fetch({
            limit: 11,
          }); // 10 + current
          const recentMessages = Array.from(messages.values())
            .filter((m) => m.id !== message.id) // Exclude current message
            .slice(0, 10)
            .reverse(); // Oldest first

          if (recentMessages.length > 0) {
            return recentMessages
              .map((m) => `[${m.author.username}]: ${m.content.slice(0, 500)}`)
              .join("\n");
          }
          return "";
        } catch {
          return "";
        }
      })(),
      // Fetch channel-specific prompt (with cache)
      message.guild?.id
        ? getCachedChannelContext(message.guild.id, message.channel.id)
        : Promise.resolve(undefined),
    ]);

    // Build messages for LLM with context
    const llmMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    // Add system prompt with context (including IDs for tools)
    const systemPrompt = getSystemPrompt({
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      channelId: message.channel.id,
      channelName,
      userId: message.author.id,
      userName: message.author.username,
      isDM,
      channelPrompt,
    });

    llmMessages.push({ role: "system", content: systemPrompt });

    // Add recent conversation context if available
    if (contextMessages) {
      llmMessages.push({
        role: "system",
        content: `## Recent Conversation Context\n\nLast messages in this channel:\n\n${contextMessages}\n\n---\nConsider this context when responding.`,
      });
    }

    // Add reply context if this is a reply to the bot
    if (replyToMessage) {
      llmMessages.push({
        role: "system",
        content: `## Contexto do Reply\n\nO usuário está respondendo diretamente a esta sua mensagem anterior:\n\n> ${replyToMessage}\n\nResponda considerando esse contexto e mantenha a continuidade da conversa.`,
      });
    }

    // Add user message
    llmMessages.push({ role: "user", content: userInput });

    // Call the model using Mesh API with Discord context

    const response = await generateResponse(env, llmMessages, {
      discordContext: {
        guildId: message.guild?.id || "DM",
        channelId: message.channel.id,
        userId: message.author.id,
        userName: message.author.username,
      },
    });

    let responseContent =
      response.content || "Desculpe, não consegui gerar uma resposta.";
    const durationMs = Date.now() - startTime;

    // Process channel prompt markers if present
    if (message.guild?.id) {
      responseContent = await processPromptMarkers(
        responseContent,
        message.guild.id,
        message.channel.id,
        channelName,
        message.author.id,
        message.author.username,
      );
    }

    // Send response (split if needed for Discord's 2000 char limit)
    const maxLength = 2000;
    if (responseContent.length <= maxLength) {
      await safeReply(message, responseContent);
    } else {
      // Split into chunks at natural break points
      const chunks: string[] = [];
      let remaining = responseContent;

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

      for (const chunk of chunks) {
        await safeReply(message, chunk);
      }
    }

    console.log(
      `[Agent] Response sent (${durationMs}ms, ${response.tokens || 0} tokens)`,
    );
  } catch (error) {
    console.error(`[Agent] Error:`, error);

    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check for common errors and provide helpful messages
    if (errorMsg.includes("Organization context is required")) {
      await safeReply(
        message,
        `⚠️ **Sessão expirada!**\n\n` +
          `O token de autenticação com o Mesh expirou.\n\n` +
          `**Solução:** Vá no Mesh Dashboard e clique em "Save" na configuração deste MCP para renovar a sessão.`,
      );
    } else if (
      errorMsg.includes("Database") &&
      errorMsg.includes("not initialized")
    ) {
      await safeReply(
        message,
        `⚠️ **Banco de dados não inicializado!**\n\n` +
          `Use o comando no Mesh: \`DISCORD_START_BOT\` ou clique em "Save" na config.`,
      );
    } else if (errorMsg.includes("timed out")) {
      await safeReply(
        message,
        `⏱️ **Timeout!** A requisição demorou muito.\n\n` +
          `Isso pode acontecer se o modelo estiver sobrecarregado. Tente novamente.`,
      );
    } else {
      await safeReply(
        message,
        `❌ Erro ao processar sua mensagem.\n\n\`\`\`${errorMsg}\`\`\``,
      );
    }
  } finally {
    // Always stop the typing indicator
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
}

// ============================================================================
// Prompt Marker Processing
// ============================================================================

/**
 * Process [SAVE_CHANNEL_PROMPT] and [CLEAR_CHANNEL_PROMPT] markers in LLM response
 * Extracts the prompt content, saves to database, and removes markers from response
 */
async function processPromptMarkers(
  content: string,
  guildId: string,
  channelId: string,
  channelName: string | undefined,
  authorId: string,
  authorUsername: string,
): Promise<string> {
  const db = await import("../../../shared/db.ts");

  // Check for SAVE_CHANNEL_PROMPT marker
  const saveMatch = content.match(
    /\[SAVE_CHANNEL_PROMPT\]([\s\S]*?)\[\/SAVE_CHANNEL_PROMPT\]/i,
  );

  if (saveMatch) {
    const promptToSave = saveMatch[1].trim();

    if (promptToSave) {
      try {
        await db.upsertChannelContext({
          guild_id: guildId,
          channel_id: channelId,
          channel_name: channelName || null,
          system_prompt: promptToSave,
          created_by_id: authorId,
          created_by_username: authorUsername,
        });
        // Invalidate cache after saving
        invalidateChannelContextCache(guildId, channelId);
      } catch (error) {
        console.error(`[Agent] Failed to save channel prompt:`, error);
      }
    }

    // Remove the marker from the response (user won't see it)
    content = content.replace(
      /\[SAVE_CHANNEL_PROMPT\][\s\S]*?\[\/SAVE_CHANNEL_PROMPT\]/gi,
      "",
    );
  }

  // Check for CLEAR_CHANNEL_PROMPT marker
  if (content.includes("[CLEAR_CHANNEL_PROMPT]")) {
    try {
      await db.deleteChannelContext(guildId, channelId);
      // Invalidate cache after clearing
      invalidateChannelContextCache(guildId, channelId);
    } catch (error) {
      console.error(`[Agent] Failed to clear channel prompt:`, error);
    }

    // Remove the marker from the response
    content = content.replace(/\[CLEAR_CHANNEL_PROMPT\]/gi, "");
  }

  // Clean up any extra whitespace left by marker removal
  return content.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// Message Delete Handler
// ============================================================================

/**
 * Handle message deletion - marks the message as deleted in the database
 * Note: Discord doesn't always provide who deleted the message
 */
export async function handleMessageDelete(
  message: Message | { id: string; guild?: { id: string } | null },
): Promise<void> {
  if (!message.guild) return;

  console.log(`[Message] Deleted: ${message.id}`);

  try {
    const db = await import("../../../shared/db.ts");

    // Mark the message as deleted (soft delete)
    await db.markMessageDeleted(message.id);
  } catch (error) {
    // Log but don't throw - message might not exist in DB
    console.log(
      "[Message] Could not mark as deleted (may not be indexed):",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ============================================================================
// Bulk Message Delete Handler
// ============================================================================

/**
 * Handle bulk message deletion (e.g., from mod actions or prune)
 */
export async function handleMessageDeleteBulk(
  messages: Map<
    string,
    Message | { id: string; guild?: { id: string } | null }
  >,
): Promise<void> {
  const messageIds = Array.from(messages.keys());
  if (messageIds.length === 0) return;

  console.log(`[Message] Bulk deleted: ${messageIds.length} messages`);

  try {
    const db = await import("../../../shared/db.ts");

    // Mark all messages as deleted with bulk_deleted flag
    await db.markMessagesDeleted(messageIds);
  } catch (error) {
    console.log(
      "[Message] Could not mark bulk deleted:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ============================================================================
// Message Update Handler
// ============================================================================

/**
 * Handle message edit - updates content and stores edit history
 */
export async function handleMessageUpdate(
  oldMessage: Message | { id: string; content?: string | null },
  newMessage:
    | Message
    | { id: string; content?: string | null; editedAt?: Date | null },
): Promise<void> {
  // Skip if no content change (could be embed update, etc.)
  if (oldMessage.content === newMessage.content) return;

  console.log(`[Message] Edited: ${newMessage.id}`);

  try {
    const db = await import("../../../shared/db.ts");

    // Get editedAt from newMessage if it's a full Message object
    const editedAt =
      "editedAt" in newMessage && newMessage.editedAt
        ? newMessage.editedAt
        : new Date();

    // Update the message content and add to edit history
    await db.updateMessageContent(
      newMessage.id,
      newMessage.content || null,
      editedAt,
    );
  } catch (error) {
    console.log(
      "[Message] Could not update edited message:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
