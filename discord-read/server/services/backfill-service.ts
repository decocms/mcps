/**
 * Backfill Service
 *
 * Syncs historical Discord messages to the database.
 * - Only syncs channels visible to ALLOWED_ROLES
 * - Runs incrementally (skips already-synced messages)
 * - Sends progress notifications to LOG_CHANNEL_ID
 */

import type { Env } from "../types/env.ts";
import { discordAPI } from "../tools/discord/api.ts";
import { runSQL, upsertMessage, type MessageData } from "../../shared/db.ts";

// Discord permission bits
const VIEW_CHANNEL = BigInt(0x400); // 1024

// Delay between API calls
const FETCH_DELAY_MS = 500;
const MESSAGES_PER_REQUEST = 100;

// Simple delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Types
// ============================================================================

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
  parent_id?: string | null;
  position: number;
  permission_overwrites?: PermissionOverwrite[];
}

interface PermissionOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string;
  deny: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: Array<{ id: string }>;
  mention_roles: string[];
  mention_channels?: Array<{ id: string }>;
  attachments: unknown[];
  embeds: unknown[];
  reactions?: unknown[];
  pinned: boolean;
  webhook_id?: string;
  type: number;
  flags?: number;
  message_reference?: {
    message_id?: string;
    channel_id?: string;
    guild_id?: string;
  };
  referenced_message?: DiscordMessage | null;
  sticker_items?: unknown[];
  components?: unknown[];
}

interface BackfillProgress {
  guildId: string;
  guildName: string;
  totalChannels: number;
  processedChannels: number;
  skippedChannels: number;
  totalMessages: number;
  startTime: number;
  currentChannel?: string;
  errors: Array<{ channel: string; error: string }>;
}

export interface BackfillResult {
  success: boolean;
  guildId: string;
  channelsProcessed: number;
  channelsSkipped: number;
  totalMessages: number;
  duration: number;
  errors: Array<{ channel: string; error: string }>;
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if any of the given roles can view the channel
 * based on permission_overwrites
 */
export function canRolesViewChannel(
  channel: DiscordChannel,
  roleIds: string[],
  everyoneRoleId: string,
): boolean {
  const overwrites = channel.permission_overwrites || [];

  // If no overwrites, channel is visible to @everyone
  if (overwrites.length === 0) {
    return true;
  }

  // Check @everyone role first (base permissions)
  const everyoneOverwrite = overwrites.find(
    (ow) => ow.type === 0 && ow.id === everyoneRoleId,
  );

  let baseAllow = true;
  if (everyoneOverwrite) {
    const deny = BigInt(everyoneOverwrite.deny);
    if ((deny & VIEW_CHANNEL) !== BigInt(0)) {
      baseAllow = false; // @everyone is denied
    }
  }

  // Check specific role overwrites
  for (const roleId of roleIds) {
    const roleOverwrite = overwrites.find(
      (ow) => ow.type === 0 && ow.id === roleId,
    );

    if (roleOverwrite) {
      const allow = BigInt(roleOverwrite.allow);
      const deny = BigInt(roleOverwrite.deny);

      // Explicit allow takes precedence
      if ((allow & VIEW_CHANNEL) !== BigInt(0)) {
        return true;
      }
      // Explicit deny
      if ((deny & VIEW_CHANNEL) !== BigInt(0)) {
        continue; // Check next role
      }
    }
  }

  // If no specific overwrites, fall back to @everyone permission
  return baseAllow;
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Get the oldest message ID we have for a channel
 * (to continue syncing from where we left off)
 */
export async function getOldestSyncedMessageId(
  channelId: string,
): Promise<string | null> {
  const result = await runSQL<{ id: string }>(
    `SELECT id FROM discord_message WHERE channel_id = ? ORDER BY created_at ASC LIMIT 1`,
    [channelId],
  );
  return result[0]?.id || null;
}

/**
 * Get the newest message ID we have for a channel
 * (to fetch newer messages)
 */
export async function getNewestSyncedMessageId(
  channelId: string,
): Promise<string | null> {
  const result = await runSQL<{ id: string }>(
    `SELECT id FROM discord_message WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1`,
    [channelId],
  );
  return result[0]?.id || null;
}

/**
 * Convert Discord API message to our database format
 */
function convertToMessageData(
  msg: DiscordMessage,
  channelName: string,
  guildId: string,
): MessageData {
  return {
    id: msg.id,
    guild_id: guildId,
    channel_id: msg.channel_id,
    channel_name: channelName,
    channel_type: null,
    parent_channel_id: null,
    thread_id: null,
    is_dm: false,
    author_id: msg.author.id,
    author_username: msg.author.username,
    author_global_name: msg.author.global_name || null,
    author_avatar: msg.author.avatar || null,
    author_bot: msg.author.bot || false,
    content: msg.content,
    content_clean: msg.content, // Simplified
    type: msg.type,
    pinned: msg.pinned,
    tts: msg.tts,
    flags: msg.flags || 0,
    webhook_id: msg.webhook_id || null,
    application_id: null,
    interaction: null,
    mention_everyone: msg.mention_everyone,
    mention_users: msg.mentions.map((m) => m.id),
    mention_roles: msg.mention_roles,
    mention_channels: msg.mention_channels?.map((c) => c.id) || null,
    attachments: msg.attachments.length > 0 ? msg.attachments : null,
    embeds: msg.embeds.length > 0 ? msg.embeds : null,
    stickers: msg.sticker_items || null,
    components: msg.components || null,
    reply_to_id: msg.message_reference?.message_id || null,
    message_reference: msg.message_reference || null,
    deleted: false,
    created_at: new Date(msg.timestamp),
    edited_at: msg.edited_timestamp ? new Date(msg.edited_timestamp) : null,
  };
}

// ============================================================================
// Backfill Core Logic
// ============================================================================

/**
 * Fetch messages from Discord API with pagination
 * Fetches BEFORE a given ID to get older messages
 */
async function fetchMessagesBefore(
  env: Env,
  channelId: string,
  beforeId?: string,
  limit: number = MESSAGES_PER_REQUEST,
): Promise<DiscordMessage[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (beforeId) {
    params.set("before", beforeId);
  }

  return discordAPI<DiscordMessage[]>(
    env,
    `/channels/${channelId}/messages?${params.toString()}`,
  );
}

/**
 * Fetch messages from Discord API with pagination
 * Fetches AFTER a given ID to get newer messages
 */
async function fetchMessagesAfter(
  env: Env,
  channelId: string,
  afterId: string,
  limit: number = MESSAGES_PER_REQUEST,
): Promise<DiscordMessage[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("after", afterId);

  return discordAPI<DiscordMessage[]>(
    env,
    `/channels/${channelId}/messages?${params.toString()}`,
  );
}

/**
 * Send a notification message to the log channel
 */
async function sendLogNotification(
  env: Env,
  logChannelId: string,
  content: string,
): Promise<void> {
  try {
    await discordAPI(env, `/channels/${logChannelId}/messages`, {
      method: "POST",
      body: { content },
    });
  } catch (error) {
    console.error(
      `[Backfill] Failed to send log notification:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Sync all messages from a single channel
 */
async function syncChannel(
  env: Env,
  channel: DiscordChannel,
  guildId: string,
  progress: BackfillProgress,
  logChannelId?: string,
): Promise<number> {
  const channelName = channel.name;
  let totalSynced = 0;

  console.log(`[Backfill] Syncing #${channelName} (${channel.id})...`);
  progress.currentChannel = channelName;

  try {
    // Get the oldest message we have for incremental sync
    const oldestId = await getOldestSyncedMessageId(channel.id);

    // Fetch older messages (before our oldest)
    if (oldestId) {
      console.log(
        `[Backfill] #${channelName}: Fetching older messages before ${oldestId}`,
      );
      let beforeId: string | undefined = oldestId;

      while (true) {
        const messages = await fetchMessagesBefore(env, channel.id, beforeId);

        if (messages.length === 0) {
          break;
        }

        // Save messages in chronological order (oldest first)
        const sortedMessages = messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        for (const msg of sortedMessages) {
          const msgData = convertToMessageData(msg, channelName, guildId);
          await upsertMessage(msgData);
          totalSynced++;
        }

        // Get the oldest message ID for next iteration
        beforeId = messages[messages.length - 1].id;

        // Progress log every 500 messages
        if (totalSynced % 500 === 0) {
          console.log(`[Backfill] #${channelName}: ${totalSynced} messages...`);
        }

        await delay(FETCH_DELAY_MS);
      }
    }

    // Also fetch newer messages (after our newest) if we have existing data
    const newestId = await getNewestSyncedMessageId(channel.id);
    if (newestId) {
      console.log(
        `[Backfill] #${channelName}: Fetching newer messages after ${newestId}`,
      );
      let afterId: string = newestId;

      while (true) {
        const messages = await fetchMessagesAfter(env, channel.id, afterId);

        if (messages.length === 0) {
          break;
        }

        // Save messages in chronological order
        const sortedMessages = messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        for (const msg of sortedMessages) {
          const msgData = convertToMessageData(msg, channelName, guildId);
          await upsertMessage(msgData);
          totalSynced++;
        }

        // Get the newest message ID for next iteration
        afterId = messages[0].id;

        await delay(FETCH_DELAY_MS);
      }
    }

    // If no existing messages, fetch all from the beginning
    if (!oldestId && !newestId) {
      console.log(`[Backfill] #${channelName}: No existing data, full sync...`);
      let beforeId: string | undefined;

      while (true) {
        const messages = await fetchMessagesBefore(env, channel.id, beforeId);

        if (messages.length === 0) {
          break;
        }

        // Save messages in chronological order (oldest first)
        const sortedMessages = messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        for (const msg of sortedMessages) {
          const msgData = convertToMessageData(msg, channelName, guildId);
          await upsertMessage(msgData);
          totalSynced++;
        }

        // Get the oldest message ID for next iteration
        beforeId = messages[messages.length - 1].id;

        // Progress log every 500 messages
        if (totalSynced % 500 === 0) {
          console.log(`[Backfill] #${channelName}: ${totalSynced} messages...`);
        }

        await delay(FETCH_DELAY_MS);
      }
    }

    console.log(
      `[Backfill] #${channelName}: Completed! ${totalSynced} messages synced.`,
    );

    // Send progress notification
    if (logChannelId) {
      const progressPct = Math.round(
        ((progress.processedChannels + 1) / progress.totalChannels) * 100,
      );
      await sendLogNotification(
        env,
        logChannelId,
        `📥 **[Backfill]** #${channelName}: ${totalSynced.toLocaleString()} messages synced (${progress.processedChannels + 1}/${progress.totalChannels} channels - ${progressPct}%)`,
      );
    }

    return totalSynced;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Backfill] Error syncing #${channelName}:`, errorMsg);
    progress.errors.push({ channel: channelName, error: errorMsg });

    if (logChannelId) {
      await sendLogNotification(
        env,
        logChannelId,
        `❌ **[Backfill]** #${channelName}: Error - ${errorMsg}`,
      );
    }

    return totalSynced;
  }
}

// ============================================================================
// Main Backfill Function
// ============================================================================

/**
 * Start the backfill process for a guild
 */
export async function startBackfill(
  env: Env,
  guildId: string,
  channelIds?: string[],
): Promise<BackfillResult> {
  const startTime = Date.now();

  // Get config from env
  const allowedRolesStr = env.MESH_REQUEST_CONTEXT?.state?.ALLOWED_ROLES;
  const logChannelId = env.MESH_REQUEST_CONTEXT?.state?.LOG_CHANNEL_ID;

  // Parse allowed roles
  const allowedRoles = allowedRolesStr
    ? allowedRolesStr.split(",").map((r: string) => r.trim())
    : [];

  console.log(`[Backfill] Starting backfill for guild ${guildId}`);
  console.log(
    `[Backfill] ALLOWED_ROLES: ${allowedRoles.join(", ") || "(all)"}`,
  );
  console.log(`[Backfill] LOG_CHANNEL_ID: ${logChannelId || "(none)"}`);

  // Fetch guild info
  const guild = await discordAPI<{ id: string; name: string }>(
    env,
    `/guilds/${guildId}`,
  );

  // Initialize progress
  const progress: BackfillProgress = {
    guildId,
    guildName: guild.name,
    totalChannels: 0,
    processedChannels: 0,
    skippedChannels: 0,
    totalMessages: 0,
    startTime,
    errors: [],
  };

  // Fetch all channels
  const allChannels = await discordAPI<DiscordChannel[]>(
    env,
    `/guilds/${guildId}/channels`,
  );

  // Filter to text channels only (type 0 = text, 5 = announcement)
  let textChannels = allChannels.filter((c) => c.type === 0 || c.type === 5);

  // If specific channel IDs provided, filter to those
  if (channelIds && channelIds.length > 0) {
    textChannels = textChannels.filter((c) => channelIds.includes(c.id));
  }

  // Filter by ALLOWED_ROLES if configured
  if (allowedRoles.length > 0) {
    const everyoneRoleId = guildId; // @everyone role ID = guild ID
    textChannels = textChannels.filter((c) =>
      canRolesViewChannel(c, allowedRoles, everyoneRoleId),
    );
    console.log(
      `[Backfill] ${textChannels.length} channels visible to ALLOWED_ROLES`,
    );
  }

  progress.totalChannels = textChannels.length;

  // Send start notification
  if (logChannelId) {
    await sendLogNotification(
      env,
      logChannelId,
      `📊 **[Backfill Started]**\n` +
        `Guild: **${guild.name}**\n` +
        `Channels to sync: **${textChannels.length}**\n` +
        `Mode: Incremental (only new messages)`,
    );
  }

  // Process each channel
  for (const channel of textChannels) {
    const messageCount = await syncChannel(
      env,
      channel,
      guildId,
      progress,
      logChannelId,
    );

    progress.processedChannels++;
    progress.totalMessages += messageCount;

    // Small delay between channels
    await delay(1000);
  }

  const duration = Date.now() - startTime;
  const durationStr = formatDuration(duration);

  console.log(
    `[Backfill] Complete! ${progress.totalMessages} messages from ${progress.processedChannels} channels in ${durationStr}`,
  );

  // Send final notification
  if (logChannelId) {
    const errorSummary =
      progress.errors.length > 0
        ? `\nErrors: ${progress.errors.length} channel(s) had issues`
        : "";

    await sendLogNotification(
      env,
      logChannelId,
      `✅ **[Backfill Complete]**\n` +
        `Guild: **${guild.name}**\n` +
        `Channels processed: **${progress.processedChannels}**\n` +
        `Total messages synced: **${progress.totalMessages.toLocaleString()}**\n` +
        `Time elapsed: **${durationStr}**${errorSummary}`,
    );
  }

  return {
    success: progress.errors.length === 0,
    guildId,
    channelsProcessed: progress.processedChannels,
    channelsSkipped: progress.skippedChannels,
    totalMessages: progress.totalMessages,
    duration,
    errors: progress.errors,
  };
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
