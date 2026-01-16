/**
 * Message Handler
 *
 * Handles message indexing and command processing.
 */

import {
  EmbedBuilder,
  type Message,
  type TextChannel,
  type MessageCreateOptions,
} from "discord.js";
import type { Env } from "../../types/env.ts";
import {
  isMeshSessionActive,
  getMeshSessionStatus,
} from "../../bot-manager.ts";

// Super Admins - always have full permissions everywhere
const SUPER_ADMINS = [
  "607266543859925014", // Jonas (dev)
];

// Track processed messages to prevent duplicates
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 100;

/**
 * Check if a user is a super admin
 */
export function isSuperAdmin(userId: string): boolean {
  return SUPER_ADMINS.includes(userId);
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
  const channelInfo = isDM
    ? "DM"
    : `#${(message.channel as TextChannel).name || "unknown"}`;
  console.log(
    `[Message] [${channelInfo}] ${message.author.username}: ${message.content.slice(0, 50)}...`,
  );

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

    console.log(`[Message] Indexed: ${message.id}`);
  } catch (error) {
    // Don't crash if indexing fails - just log
    console.error(`[Message] Failed to index:`, error);
  }
}

/**
 * Process a command message.
 * @param message - The Discord message
 * @param prefix - The prefix used (for display purposes)
 * @param env - Environment
 * @param cleanContent - Optional pre-cleaned content (without prefix)
 * @param isDM - Whether this is a DM
 */
export async function processCommand(
  message: Message,
  prefix: string,
  env: Env,
  cleanContent?: string,
  isDM: boolean = false,
): Promise<void> {
  // In guilds, we need member info; in DMs, we don't have it
  if (!isDM && (!message.guild || !message.member)) return;

  // Prevent duplicate processing
  const messageKey = `${message.id}-${message.channelId}`;
  if (processedMessages.has(messageKey)) {
    console.log(`[Command] Skipping duplicate: ${message.id}`);
    return;
  }

  // Add to processed cache
  processedMessages.add(messageKey);

  // Cleanup old entries if cache is too large
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    const entries = Array.from(processedMessages);
    entries
      .slice(0, entries.length - MAX_PROCESSED_CACHE)
      .forEach((e) => processedMessages.delete(e));
  }

  // Parse command and args from clean content or original message
  const contentToParse =
    cleanContent ?? message.content.slice(prefix.length).trim();
  const args = contentToParse.split(/\s+/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  console.log(
    `[Command] Processing: ${commandName} with args: ${args.join(", ")}`,
  );

  // ============================================================================
  // Built-in Commands
  // ============================================================================

  switch (commandName) {
    case "help":
      await handleHelp(message, prefix);
      break;
    case "ping":
      await handlePing(message);
      break;
    case "status":
      await handleStatus(message, prefix);
      break;
    default:
      // Everything else goes to the default AI agent (via Mesh binding)
      // Re-join the command name with args for the full message
      const fullInput = [commandName, ...args].join(" ");
      await handleDefaultAgent(message, fullInput, env);
      break;
  }
}

/**
 * Handle default agent - sends message directly to Mesh AI Agent
 * This is called for any message that isn't a built-in command
 */
async function handleDefaultAgent(
  message: Message,
  userInput: string,
  env: Env,
): Promise<void> {
  const isDM = !message.guild;

  // Empty input
  if (!userInput.trim()) {
    await safeReply(message, "👋 Olá! Como posso ajudar você hoje?");
    return;
  }

  // Check if Mesh session is active
  if (!isMeshSessionActive()) {
    const sessionStatus = getMeshSessionStatus();
    console.log(
      `[Agent] ⚠️ Mesh session inactive (failures: ${sessionStatus.consecutiveFailures})`,
    );
    await safeReply(
      message,
      `⚠️ **Sessão com o Mesh expirada!**\n\n` +
        `O bot está online mas a conexão com a IA expirou após inatividade.\n\n` +
        `**Como resolver:**\n` +
        `1. Vá no **Mesh Dashboard**\n` +
        `2. Clique em **"Save"** na configuração deste MCP\n` +
        `3. Isso irá renovar a sessão automaticamente\n\n` +
        `_A sessão expira após ~5 minutos sem uso._`,
    );
    return;
  }

  const channelInfo = isDM
    ? `DM with ${message.author.username}`
    : `#${(message.channel as TextChannel).name || "unknown"}`;
  console.log(
    `[Agent] Processing [${channelInfo}]: "${userInput.slice(0, 50)}..."`,
  );

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
    // Import LLM module
    const { generateResponse } = await import("../../llm.ts");

    const startTime = Date.now();

    // Fetch last 10 messages from channel for context
    let contextMessages = "";
    try {
      const messages = await message.channel.messages.fetch({ limit: 11 }); // 10 + current
      const recentMessages = Array.from(messages.values())
        .filter((m) => m.id !== message.id) // Exclude current message
        .slice(0, 10)
        .reverse(); // Oldest first

      if (recentMessages.length > 0) {
        contextMessages = recentMessages
          .map((m) => `[${m.author.username}]: ${m.content.slice(0, 500)}`)
          .join("\n");
        console.log(
          `[Agent] Context: ${recentMessages.length} previous messages`,
        );
      }
    } catch (e) {
      console.log(`[Agent] Could not fetch context:`, e);
    }

    // Build messages for LLM with context
    const llmMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    // Import and use the system prompt
    const { getSystemPrompt } = await import("../../prompts/system.ts");

    const channelName =
      "name" in message.channel
        ? (message.channel.name ?? undefined)
        : undefined;

    // Add system prompt with context (including IDs for tools)
    const systemPrompt = getSystemPrompt({
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      channelId: message.channel.id,
      channelName,
      userId: message.author.id,
      userName: message.author.username,
      isDM,
    });

    llmMessages.push({ role: "system", content: systemPrompt });

    // Add recent conversation context if available
    if (contextMessages) {
      llmMessages.push({
        role: "system",
        content: `## Recent Conversation Context\n\nLast messages in this channel:\n\n${contextMessages}\n\n---\nConsider this context when responding.`,
      });
    }

    // Add user message
    llmMessages.push({ role: "user", content: userInput });

    // Call the model using Mesh API with Discord context
    console.log(`[Agent] Calling Mesh API...`);

    const response = await generateResponse(env, llmMessages, {
      discordContext: {
        guildId: message.guild?.id || "DM",
        channelId: message.channel.id,
        userId: message.author.id,
        userName: message.author.username,
      },
    });

    const responseContent =
      response.content || "Desculpe, não consegui gerar uma resposta.";
    const durationMs = Date.now() - startTime;

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
// Command Handlers
// ============================================================================

async function handlePing(message: Message): Promise<void> {
  const latency = Date.now() - message.createdTimestamp;
  await safeReply(message, `🏓 Pong! Latency: **${latency}ms**`);
}

async function handleStatus(message: Message, prefix: string): Promise<void> {
  const sessionStatus = getMeshSessionStatus();
  const sessionEmoji = sessionStatus.isValid ? "✅" : "❌";
  const sessionText = sessionStatus.isValid
    ? "Ativa"
    : `Expirada (${sessionStatus.consecutiveFailures} falhas)`;

  const lastSuccessText = sessionStatus.lastSuccess
    ? `${Math.floor((Date.now() - sessionStatus.lastSuccess.getTime()) / 1000)}s atrás`
    : "Nunca";

  const embed = new EmbedBuilder()
    .setColor(sessionStatus.isValid ? 0x00ff00 : 0xff9900)
    .setTitle("📊 Bot Status")
    .addFields(
      { name: "Discord", value: "✅ Online", inline: true },
      { name: "Prefix", value: `\`${prefix}\``, inline: true },
      { name: "Guild", value: message.guild?.name || "Unknown", inline: true },
      {
        name: "Sessão Mesh",
        value: `${sessionEmoji} ${sessionText}`,
        inline: true,
      },
      {
        name: "Heartbeat",
        value: sessionStatus.isHeartbeatRunning ? "✅ Ativo" : "❌ Parado",
        inline: true,
      },
      { name: "Último check", value: lastSuccessText, inline: true },
    )
    .setFooter({
      text: sessionStatus.isValid
        ? "Use MCP tools to manage agents and view indexed messages"
        : "⚠️ Clique 'Save' no Mesh Dashboard para renovar a sessão",
    });

  await safeReply(message, { embeds: [embed] });
}

async function handleHelp(message: Message, prefix: string): Promise<void> {
  // Get bot info for display - always show @BotName format for mention prefix
  const bot = message.client.user;
  const botName = bot?.username || "Bot";

  // If prefix is a mention, show @BotName, otherwise show the text prefix
  const isMention = prefix.includes("<@");
  const displayPrefix = isMention ? `@${botName} ` : prefix;

  // Debug log
  console.log(`[Help] Generating help embed...`);
  console.log(
    `[Help] Bot: ${botName} | Mention: ${isMention} | Display: "${displayPrefix}"`,
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📖 ${botName} - Help`)
    .setDescription(
      "Um bot Discord integrado com **IA** para responder suas perguntas!\n\n💡 **Dica:** Me mencione e faça sua pergunta diretamente!",
    )
    .setThumbnail(bot?.displayAvatarURL() || null)
    .addFields(
      {
        name: "🤖 Como Usar",
        value: [
          `Apenas me mencione e faça sua pergunta:`,
          `\`@${botName} qual é a capital do Brasil?\``,
          `\`@${botName} me ajude com este código\``,
          `\`@${botName} traduza isso para inglês\``,
        ].join("\n"),
      },
      {
        name: "🔧 Comandos do Bot",
        value: [
          `\`${displayPrefix}help\` → Mostra esta ajuda`,
          `\`${displayPrefix}ping\` → Verifica latência`,
          `\`${displayPrefix}status\` → Status do bot`,
        ].join("\n"),
      },
      {
        name: "⚙️ Admin (Opcional)",
        value: [
          `\`${displayPrefix}agent help\` → Gerenciar agentes customizados`,
        ].join("\n"),
      },
    )
    .setFooter({
      text: `Guild: ${message.guild?.name} • ID: ${message.guild?.id}`,
      iconURL: message.guild?.iconURL() || undefined,
    })
    .setTimestamp();

  await safeReply(message, { embeds: [embed] });
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
