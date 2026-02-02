/**
 * Shared Database Module
 *
 * Database operations using Supabase.
 * Used by both Discord bot and MCP server.
 */

import { getSupabaseClient } from "../server/lib/supabase-client.ts";
import type { Env } from "../server/types/env.ts";

// Global environment reference (kept for compatibility but not used for DB)
let _env: Env | null = null;

/**
 * Set the environment for database operations.
 * Called by server/main.ts after runtime initialization.
 */
export function setDatabaseEnv(env: Env): void {
  _env = env;
}

/**
 * Get the current environment.
 */
export function getDatabaseEnv(): Env | null {
  return _env;
}

/**
 * Run a SQL query using Supabase RPC
 * Note: This requires a stored function in Supabase to execute arbitrary SQL
 * For now, we'll use direct table operations instead
 */
export async function runSQL<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "[Database] Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  // TODO: Implement this using Supabase RPC or migrate to direct table operations
  console.warn(
    "[Database] runSQL called but not fully implemented with Supabase yet",
  );
  return [];
}

// ============================================================================
// Guild Operations
// ============================================================================

export interface GuildData {
  id: string;
  name?: string | null;
  icon?: string | null;
  owner_id?: string | null;
  command_prefix?: string;
  log_channel_id?: string | null;
}

export async function upsertGuild(guild: GuildData): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping guild indexing.",
    );
    return;
  }

  const row = {
    id: guild.id,
    name: guild.name || null,
    icon: guild.icon || null,
    owner_id: guild.owner_id || null,
    command_prefix: guild.command_prefix || "!",
    log_channel_id: guild.log_channel_id || null,
  };

  const { error } = await client.from("guilds").upsert(row, {
    onConflict: "id",
  });

  if (error) {
    console.error("[Database] Failed to upsert guild:", error);
    throw new Error(`Failed to upsert guild: ${error.message}`);
  }
}

export async function getGuild(id: string): Promise<GuildData | null> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured.");
    return null;
  }

  const { data, error } = await client
    .from("guilds")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    console.error("[Database] Failed to get guild:", error);
    return null;
  }

  return data as GuildData;
}

// ============================================================================
// Message Operations
// ============================================================================

export interface MessageEditHistoryEntry {
  content: string | null;
  edited_at: string;
}

export interface MessageData {
  id: string;
  guild_id?: string | null;
  channel_id: string;
  channel_name?: string | null;
  channel_type?: number | null;
  parent_channel_id?: string | null;
  thread_id?: string | null;
  is_dm?: boolean;
  author_id: string;
  author_username: string;
  author_global_name?: string | null;
  author_avatar?: string | null;
  author_bot: boolean;
  content?: string | null;
  content_clean?: string | null;
  type: number;
  pinned: boolean;
  tts: boolean;
  flags?: number;
  webhook_id?: string | null;
  application_id?: string | null;
  interaction?: unknown | null;
  mention_everyone: boolean;
  mention_users?: string[] | null;
  mention_roles?: string[] | null;
  mention_channels?: string[] | null;
  attachments?: unknown | null;
  embeds?: unknown | null;
  stickers?: unknown | null;
  components?: unknown | null;
  reply_to_id?: string | null;
  message_reference?: unknown | null;
  edit_history?: MessageEditHistoryEntry[] | null;
  deleted?: boolean;
  deleted_at?: Date | null;
  deleted_by_id?: string | null;
  deleted_by_username?: string | null;
  bulk_deleted?: boolean;
  created_at: Date;
  edited_at?: Date | null;
}

export async function upsertMessage(msg: MessageData): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping message indexing.",
    );
    return;
  }

  const row = {
    id: msg.id,
    guild_id: msg.guild_id || null,
    channel_id: msg.channel_id,
    channel_name: msg.channel_name || null,
    channel_type: msg.channel_type ?? null,
    parent_channel_id: msg.parent_channel_id || null,
    thread_id: msg.thread_id || null,
    is_dm: msg.is_dm ?? false,
    author_id: msg.author_id,
    author_username: msg.author_username,
    author_global_name: msg.author_global_name || null,
    author_avatar: msg.author_avatar || null,
    author_bot: msg.author_bot,
    content: msg.content || null,
    content_clean: msg.content_clean || null,
    type: msg.type,
    pinned: msg.pinned,
    tts: msg.tts,
    flags: msg.flags || 0,
    webhook_id: msg.webhook_id || null,
    application_id: msg.application_id || null,
    interaction: msg.interaction || null,
    mention_everyone: msg.mention_everyone,
    mention_users: msg.mention_users || null,
    mention_roles: msg.mention_roles || null,
    mention_channels: msg.mention_channels || null,
    attachments: msg.attachments || null,
    embeds: msg.embeds || null,
    stickers: msg.stickers || null,
    components: msg.components || null,
    reply_to_id: msg.reply_to_id || null,
    message_reference: msg.message_reference || null,
    edit_history: msg.edit_history || null,
    deleted: msg.deleted || false,
    deleted_at: msg.deleted_at?.toISOString() || null,
    deleted_by_id: msg.deleted_by_id || null,
    deleted_by_username: msg.deleted_by_username || null,
    bulk_deleted: msg.bulk_deleted || false,
    created_at: msg.created_at.toISOString(),
    edited_at: msg.edited_at?.toISOString() || null,
  };

  const { error } = await client.from("discord_message").upsert(row, {
    onConflict: "id",
  });

  if (error) {
    console.error("[Database] Failed to upsert message:", error);
    throw new Error(`Failed to upsert message: ${error.message}`);
  }
}

export async function getMessage(id: string): Promise<MessageData | null> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured.");
    return null;
  }

  const { data, error } = await client
    .from("discord_message")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    console.error("[Database] Failed to get message:", error);
    return null;
  }

  return data as MessageData;
}

export async function getRecentMessages(
  channelId: string,
  limit: number = 10,
  beforeId?: string,
): Promise<MessageData[]> {
  let sql = `SELECT * FROM discord_message WHERE channel_id = ? AND deleted = FALSE`;
  const params: unknown[] = [channelId];

  if (beforeId) {
    sql += ` AND created_at < (SELECT created_at FROM discord_message WHERE id = ?)`;
    params.push(beforeId);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await runSQL<MessageData>(sql, params);
  return result.reverse(); // Return in chronological order
}

/**
 * Mark a message as deleted (soft delete - keeps history)
 */
export async function markMessageDeleted(
  messageId: string,
  deletedById?: string | null,
  deletedByUsername?: string | null,
  bulkDeleted: boolean = false,
): Promise<void> {
  await runSQL(
    `UPDATE discord_message SET
      deleted = TRUE,
      deleted_at = NOW(),
      deleted_by_id = ?,
      deleted_by_username = ?,
      bulk_deleted = ?,
      last_updated_at = NOW()
    WHERE id = ?`,
    [deletedById || null, deletedByUsername || null, bulkDeleted, messageId],
  );
}

/**
 * Mark multiple messages as deleted (bulk delete)
 */
export async function markMessagesDeleted(
  messageIds: string[],
  deletedById?: string | null,
  deletedByUsername?: string | null,
): Promise<void> {
  if (messageIds.length === 0) return;

  // Use ANY for array matching
  await runSQL(
    `UPDATE discord_message SET
      deleted = TRUE,
      deleted_at = NOW(),
      deleted_by_id = ?,
      deleted_by_username = ?,
      bulk_deleted = TRUE,
      last_updated_at = NOW()
    WHERE id = ANY(?)`,
    [deletedById || null, deletedByUsername || null, messageIds],
  );
}

/**
 * Update message content and add to edit history
 */
export async function updateMessageContent(
  messageId: string,
  newContent: string | null,
  editedAt: Date,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping message update.",
    );
    return;
  }

  // First get the current content to add to history
  const current = await getMessage(messageId);
  if (!current) return;

  const historyEntry: MessageEditHistoryEntry = {
    content: current.content || null,
    edited_at: new Date().toISOString(),
  };

  // Get existing history or create new array
  const existingHistory =
    (current.edit_history as MessageEditHistoryEntry[]) || [];
  const newHistory = [...existingHistory, historyEntry];

  const { error } = await client
    .from("discord_message")
    .update({
      content: newContent,
      edited_at: editedAt.toISOString(),
      edit_history: newHistory,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) {
    console.error("[Database] Failed to update message content:", error);
  }
}

/**
 * Get deleted messages in a channel (for audit/moderation)
 */
export async function getDeletedMessages(
  channelId: string,
  limit: number = 50,
): Promise<MessageData[]> {
  return runSQL<MessageData>(
    `SELECT * FROM discord_message 
     WHERE channel_id = ? AND deleted = TRUE
     ORDER BY deleted_at DESC
     LIMIT ?`,
    [channelId, limit],
  );
}

/**
 * Get message edit history
 */
export async function getMessageEditHistory(
  messageId: string,
): Promise<MessageEditHistoryEntry[]> {
  const msg = await getMessage(messageId);
  return (msg?.edit_history as MessageEditHistoryEntry[]) || [];
}

// ============================================================================
// Reaction Operations
// ============================================================================

export interface ReactionData {
  message_id: string;
  emoji_id?: string | null;
  emoji_name: string;
  emoji_animated: boolean;
  count: number;
  count_burst: number;
  count_normal: number;
  user_ids?: string[] | null;
}

export async function upsertReaction(reaction: ReactionData): Promise<void> {
  const userIdsJson = reaction.user_ids
    ? JSON.stringify(reaction.user_ids)
    : null;

  await runSQL(
    `INSERT INTO discord_message_reaction (
      id, message_id, emoji_id, emoji_name, emoji_animated,
      count, count_burst, count_normal, user_ids, created_at, updated_at
    ) VALUES (gen_random_uuid()::text, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (message_id, emoji_id, emoji_name) DO UPDATE SET
      count = EXCLUDED.count,
      count_burst = EXCLUDED.count_burst,
      count_normal = EXCLUDED.count_normal,
      user_ids = EXCLUDED.user_ids,
      updated_at = NOW()`,
    [
      reaction.message_id,
      reaction.emoji_id || "",
      reaction.emoji_name,
      reaction.emoji_animated,
      reaction.count,
      reaction.count_burst,
      reaction.count_normal,
      userIdsJson,
    ],
  );
}

export async function deleteReaction(
  messageId: string,
  emojiId: string | null,
  emojiName: string,
): Promise<void> {
  await runSQL(
    `DELETE FROM discord_message_reaction 
     WHERE message_id = ? AND emoji_id = ? AND emoji_name = ?`,
    [messageId, emojiId || "", emojiName],
  );
}

export async function deleteAllReactions(messageId: string): Promise<void> {
  await runSQL(`DELETE FROM discord_message_reaction WHERE message_id = ?`, [
    messageId,
  ]);
}

export async function getReactionUserIds(
  messageId: string,
  emojiId: string | null,
  emojiName: string,
): Promise<string[]> {
  const result = await runSQL<{ user_ids: string[] | null }>(
    `SELECT user_ids FROM discord_message_reaction 
     WHERE message_id = ? AND emoji_id = ? AND emoji_name = ?`,
    [messageId, emojiId || "", emojiName],
  );
  return result[0]?.user_ids || [];
}

// ============================================================================
// Guilds Table (needed for foreign keys)
// ============================================================================

export const guildsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  owner_id TEXT,
  command_prefix TEXT DEFAULT '!',
  log_channel_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
`;

export const guildsTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_guilds_owner ON guilds(owner_id);
`;

// ============================================================================
// Channel Operations
// ============================================================================

export interface ChannelData {
  id: string;
  guild_id: string;
  name: string;
  type: number;
  position?: number | null;
  parent_id?: string | null;
  category_name?: string | null;
  owner_id?: string | null;
  message_count?: number | null;
  member_count?: number | null;
  topic?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number | null;
  archived?: boolean;
  archived_at?: Date | null;
  auto_archive_duration?: number | null;
  locked?: boolean;
  permission_overwrites?: unknown | null;
  deleted?: boolean;
  deleted_at?: Date | null;
  created_at?: Date | null;
}

export async function upsertChannel(channel: ChannelData): Promise<void> {
  await runSQL(
    `INSERT INTO discord_channel (
      id, guild_id, name, type, position, parent_id, category_name,
      owner_id, message_count, member_count, topic, nsfw, rate_limit_per_user,
      archived, archived_at, auto_archive_duration, locked,
      permission_overwrites, deleted, deleted_at, created_at, indexed_at, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      position = EXCLUDED.position,
      parent_id = EXCLUDED.parent_id,
      category_name = EXCLUDED.category_name,
      message_count = EXCLUDED.message_count,
      member_count = EXCLUDED.member_count,
      topic = EXCLUDED.topic,
      nsfw = EXCLUDED.nsfw,
      archived = EXCLUDED.archived,
      archived_at = EXCLUDED.archived_at,
      locked = EXCLUDED.locked,
      permission_overwrites = EXCLUDED.permission_overwrites,
      deleted = EXCLUDED.deleted,
      deleted_at = EXCLUDED.deleted_at,
      last_updated_at = NOW()`,
    [
      channel.id,
      channel.guild_id,
      channel.name,
      channel.type,
      channel.position ?? null,
      channel.parent_id || null,
      channel.category_name || null,
      channel.owner_id || null,
      channel.message_count ?? null,
      channel.member_count ?? null,
      channel.topic || null,
      channel.nsfw ?? false,
      channel.rate_limit_per_user ?? null,
      channel.archived ?? false,
      channel.archived_at?.toISOString() || null,
      channel.auto_archive_duration ?? null,
      channel.locked ?? false,
      channel.permission_overwrites
        ? JSON.stringify(channel.permission_overwrites)
        : null,
      channel.deleted ?? false,
      channel.deleted_at?.toISOString() || null,
      channel.created_at?.toISOString() || null,
    ],
  );
}

export async function getChannel(id: string): Promise<ChannelData | null> {
  const result = await runSQL<ChannelData>(
    `SELECT * FROM discord_channel WHERE id = ? LIMIT 1`,
    [id],
  );
  return result[0] || null;
}

export async function markChannelDeleted(channelId: string): Promise<void> {
  await runSQL(
    `UPDATE discord_channel SET
      deleted = TRUE,
      deleted_at = NOW(),
      last_updated_at = NOW()
    WHERE id = ?`,
    [channelId],
  );
}

// ============================================================================
// Member Operations
// ============================================================================

export interface MemberData {
  guild_id: string;
  user_id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
  nickname?: string | null;
  display_avatar?: string | null;
  roles?: string[] | null;
  permissions?: string | null;
  joined_at?: Date | null;
  left_at?: Date | null;
  is_member?: boolean;
  timed_out_until?: Date | null;
}

export async function upsertMember(member: MemberData): Promise<void> {
  await runSQL(
    `INSERT INTO discord_member (
      guild_id, user_id, username, global_name, avatar, bot,
      nickname, display_avatar, roles, permissions,
      joined_at, left_at, is_member, timed_out_until,
      indexed_at, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      username = EXCLUDED.username,
      global_name = EXCLUDED.global_name,
      avatar = EXCLUDED.avatar,
      nickname = EXCLUDED.nickname,
      display_avatar = EXCLUDED.display_avatar,
      roles = EXCLUDED.roles,
      permissions = EXCLUDED.permissions,
      is_member = EXCLUDED.is_member,
      timed_out_until = EXCLUDED.timed_out_until,
      left_at = EXCLUDED.left_at,
      last_updated_at = NOW()`,
    [
      member.guild_id,
      member.user_id,
      member.username,
      member.global_name || null,
      member.avatar || null,
      member.bot ?? false,
      member.nickname || null,
      member.display_avatar || null,
      member.roles ? JSON.stringify(member.roles) : null,
      member.permissions || null,
      member.joined_at?.toISOString() || null,
      member.left_at?.toISOString() || null,
      member.is_member ?? true,
      member.timed_out_until?.toISOString() || null,
    ],
  );
}

export async function getMember(
  guildId: string,
  userId: string,
): Promise<MemberData | null> {
  const result = await runSQL<MemberData>(
    `SELECT * FROM discord_member WHERE guild_id = ? AND user_id = ? LIMIT 1`,
    [guildId, userId],
  );
  return result[0] || null;
}

export async function markMemberLeft(
  guildId: string,
  userId: string,
): Promise<void> {
  await runSQL(
    `UPDATE discord_member SET
      is_member = FALSE,
      left_at = NOW(),
      last_updated_at = NOW()
    WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId],
  );
}

// ============================================================================
// Channel Context Operations (custom prompts per channel)
// ============================================================================

export interface ChannelContextData {
  id?: string;
  guild_id: string;
  channel_id: string;
  channel_name?: string | null;
  system_prompt: string;
  enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
  created_by_id: string;
  created_by_username: string;
}

/**
 * Get custom prompt for a channel
 */
export async function getChannelContext(
  guildId: string,
  channelId: string,
): Promise<ChannelContextData | null> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured.");
    return null;
  }

  const { data, error } = await client
    .from("discord_channel_context")
    .select("*")
    .eq("guild_id", guildId)
    .eq("channel_id", channelId)
    .eq("enabled", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    console.error("[Database] Failed to get channel context:", error);
    return null;
  }

  return data as ChannelContextData;
}

/**
 * Create or update custom prompt for a channel
 */
export async function upsertChannelContext(
  data: ChannelContextData,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping channel context save.",
    );
    return;
  }

  const row = {
    guild_id: data.guild_id,
    channel_id: data.channel_id,
    channel_name: data.channel_name || null,
    system_prompt: data.system_prompt,
    enabled: data.enabled ?? true,
    created_by_id: data.created_by_id,
    created_by_username: data.created_by_username,
  };

  const { error } = await client.from("discord_channel_context").upsert(row, {
    onConflict: "guild_id, channel_id",
  });

  if (error) {
    console.error("[Database] Failed to upsert channel context:", error);
    throw new Error(`Failed to upsert channel context: ${error.message}`);
  }
}

/**
 * Delete custom prompt for a channel
 */
export async function deleteChannelContext(
  guildId: string,
  channelId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured.");
    return;
  }

  const { error } = await client
    .from("discord_channel_context")
    .delete()
    .eq("guild_id", guildId)
    .eq("channel_id", channelId);

  if (error) {
    console.error("[Database] Failed to delete channel context:", error);
  }
}

/**
 * List all channel contexts for a guild
 */
export async function listChannelContexts(
  guildId: string,
): Promise<ChannelContextData[]> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured.");
    return [];
  }

  const { data, error } = await client
    .from("discord_channel_context")
    .select("*")
    .eq("guild_id", guildId)
    .eq("enabled", true)
    .order("channel_name", { ascending: true });

  if (error) {
    console.error("[Database] Failed to list channel contexts:", error);
    return [];
  }

  return (data || []) as ChannelContextData[];
}
