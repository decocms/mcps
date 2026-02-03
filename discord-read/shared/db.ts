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
    console.error("[Database] ❌ Failed to upsert message:", error);
    throw new Error(`Failed to upsert message: ${error.message}`);
  }

  console.log(
    `[Database] ✅ Message saved: ${msg.id} from ${msg.author_username}`,
  );
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
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping mark message deleted.",
    );
    return;
  }

  const { error } = await client
    .from("discord_message")
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_id: deletedById || null,
      deleted_by_username: deletedByUsername || null,
      bulk_deleted: bulkDeleted,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) {
    console.error(
      `[Database] Failed to mark message ${messageId} as deleted:`,
      error.message,
    );
    throw new Error(`Failed to mark message deleted: ${error.message}`);
  }

  console.log(`[Database] ✅ Message marked as deleted: ${messageId}`);
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

  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping bulk mark deleted.",
    );
    return;
  }

  const { error } = await client
    .from("discord_message")
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_id: deletedById || null,
      deleted_by_username: deletedByUsername || null,
      bulk_deleted: true,
      last_updated_at: new Date().toISOString(),
    })
    .in("id", messageIds);

  if (error) {
    console.error(
      `[Database] Failed to bulk mark messages as deleted:`,
      error.message,
    );
    throw new Error(`Failed to bulk mark messages deleted: ${error.message}`);
  }

  console.log(
    `[Database] ✅ ${messageIds.length} messages marked as deleted (bulk)`,
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
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping reaction upsert.",
    );
    return;
  }

  const row = {
    message_id: reaction.message_id,
    emoji_id: reaction.emoji_id || null,
    emoji_name: reaction.emoji_name,
    emoji_animated: reaction.emoji_animated,
    count: reaction.count,
    count_burst: reaction.count_burst,
    count_normal: reaction.count_normal,
    user_ids: reaction.user_ids ? JSON.stringify(reaction.user_ids) : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("discord_message_reaction")
    .upsert(row as any, {
      onConflict: "message_id,emoji_id,emoji_name",
    });

  if (error) {
    console.error(`[Database] Failed to upsert reaction:`, error.message);
    throw new Error(`Failed to upsert reaction: ${error.message}`);
  }

  console.log(
    `[Database] ✅ Reaction upserted: ${reaction.message_id} ${reaction.emoji_name}`,
  );
}

export async function deleteReaction(
  messageId: string,
  emojiId: string | null,
  emojiName: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping reaction delete.",
    );
    return;
  }

  let query = client
    .from("discord_message_reaction")
    .delete()
    .eq("message_id", messageId)
    .eq("emoji_name", emojiName);

  if (emojiId) {
    query = query.eq("emoji_id", emojiId);
  } else {
    query = query.is("emoji_id", null);
  }

  const { error } = await query;

  if (error) {
    console.error(`[Database] Failed to delete reaction:`, error.message);
    throw new Error(`Failed to delete reaction: ${error.message}`);
  }

  console.log(`[Database] ✅ Reaction deleted: ${messageId} ${emojiName}`);
}

export async function deleteAllReactions(messageId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping delete all reactions.",
    );
    return;
  }

  const { error } = await client
    .from("discord_message_reaction")
    .delete()
    .eq("message_id", messageId);

  if (error) {
    console.error(`[Database] Failed to delete all reactions:`, error.message);
    throw new Error(`Failed to delete all reactions: ${error.message}`);
  }

  console.log(`[Database] ✅ All reactions deleted for message: ${messageId}`);
}

export async function getReactionUserIds(
  messageId: string,
  emojiId: string | null,
  emojiName: string,
): Promise<string[]> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Returning empty user IDs.",
    );
    return [];
  }

  let query = client
    .from("discord_message_reaction")
    .select("user_ids")
    .eq("message_id", messageId)
    .eq("emoji_name", emojiName);

  if (emojiId) {
    query = query.eq("emoji_id", emojiId);
  } else {
    query = query.is("emoji_id", null);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return [];
    }
    console.error(`[Database] Failed to get reaction user IDs:`, error.message);
    return [];
  }

  // Parse user_ids from JSON string
  const userIdsStr = (data as any)?.user_ids;
  if (!userIdsStr) return [];

  try {
    return JSON.parse(userIdsStr);
  } catch {
    return [];
  }
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
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping channel upsert.",
    );
    return;
  }

  const row = {
    id: channel.id,
    guild_id: channel.guild_id,
    name: channel.name,
    type: channel.type,
    position: channel.position ?? null,
    parent_id: channel.parent_id || null,
    category_name: channel.category_name || null,
    owner_id: channel.owner_id || null,
    message_count: channel.message_count ?? null,
    member_count: channel.member_count ?? null,
    topic: channel.topic || null,
    nsfw: channel.nsfw ?? false,
    rate_limit_per_user: channel.rate_limit_per_user ?? null,
    archived: channel.archived ?? false,
    archived_at: channel.archived_at?.toISOString() || null,
    auto_archive_duration: channel.auto_archive_duration ?? null,
    locked: channel.locked ?? false,
    permission_overwrites: channel.permission_overwrites
      ? JSON.stringify(channel.permission_overwrites)
      : null,
    deleted: channel.deleted ?? false,
    deleted_at: channel.deleted_at?.toISOString() || null,
    created_at: channel.created_at?.toISOString() || null,
    indexed_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("discord_channel").upsert(row as any, {
    onConflict: "id",
  });

  if (error) {
    console.error(`[Database] Failed to upsert channel:`, error.message);
    throw new Error(`Failed to upsert channel: ${error.message}`);
  }

  console.log(`[Database] ✅ Channel upserted: ${channel.id}`);
}

export async function getChannel(id: string): Promise<ChannelData | null> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Returning null for channel.",
    );
    return null;
  }

  const { data, error } = await client
    .from("discord_channel")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    console.error(`[Database] Failed to get channel:`, error.message);
    return null;
  }

  return data as ChannelData;
}

export async function markChannelDeleted(channelId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping mark channel deleted.",
    );
    return;
  }

  const { error } = await client
    .from("discord_channel")
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", channelId);

  if (error) {
    console.error(
      `[Database] Failed to mark channel ${channelId} as deleted:`,
      error.message,
    );
    throw new Error(`Failed to mark channel deleted: ${error.message}`);
  }

  console.log(`[Database] ✅ Channel marked as deleted: ${channelId}`);
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
  const client = getSupabaseClient();
  if (!client) {
    console.warn("[Database] Supabase not configured. Skipping member upsert.");
    return;
  }

  const row = {
    guild_id: member.guild_id,
    user_id: member.user_id,
    username: member.username,
    global_name: member.global_name || null,
    avatar: member.avatar || null,
    bot: member.bot ?? false,
    nickname: member.nickname || null,
    display_avatar: member.display_avatar || null,
    roles: member.roles ? JSON.stringify(member.roles) : null,
    permissions: member.permissions || null,
    joined_at: member.joined_at?.toISOString() || null,
    left_at: member.left_at?.toISOString() || null,
    is_member: member.is_member ?? true,
    timed_out_until: member.timed_out_until?.toISOString() || null,
    indexed_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("discord_member").upsert(row as any, {
    onConflict: "guild_id,user_id",
  });

  if (error) {
    console.error(`[Database] Failed to upsert member:`, error.message);
    throw new Error(`Failed to upsert member: ${error.message}`);
  }

  console.log(
    `[Database] ✅ Member upserted: ${member.guild_id}/${member.user_id}`,
  );
}

export async function getMember(
  guildId: string,
  userId: string,
): Promise<MemberData | null> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Returning null for member.",
    );
    return null;
  }

  const { data, error } = await client
    .from("discord_member")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    console.error(`[Database] Failed to get member:`, error.message);
    return null;
  }

  return data as MemberData;
}

export async function markMemberLeft(
  guildId: string,
  userId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn(
      "[Database] Supabase not configured. Skipping mark member left.",
    );
    return;
  }

  const { error } = await client
    .from("discord_member")
    .update({
      is_member: false,
      left_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId)
    .eq("user_id", userId);

  if (error) {
    console.error(
      `[Database] Failed to mark member ${guildId}/${userId} as left:`,
      error.message,
    );
    throw new Error(`Failed to mark member left: ${error.message}`);
  }

  console.log(`[Database] ✅ Member marked as left: ${guildId}/${userId}`);
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
  auto_respond?: boolean; // If true, bot responds to ALL messages in this channel (no mention needed)
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
    auto_respond: data.auto_respond ?? false,
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
