/**
 * Shared Database Module
 *
 * Database operations using the DATABASE binding.
 * Used by both Discord bot and MCP server.
 */

import type { Env } from "../server/types/env.ts";

// Global environment reference (set when MCP server starts)
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
 * Run a SQL query using the DATABASE binding
 */
export async function runSQL<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!_env) {
    throw new Error(
      "[Database] Environment not initialized. Call setDatabaseEnv first.",
    );
  }

  const response =
    await _env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
      sql,
      params,
    });
  // Response is typed as object but actually has .result property
  const data = response as
    | { result?: Array<{ results?: unknown[] }> }
    | undefined;
  return (data?.result?.[0]?.results ?? []) as T[];
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
  await runSQL(
    `INSERT INTO guilds (id, name, icon, owner_id, command_prefix, log_channel_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       icon = EXCLUDED.icon,
       owner_id = EXCLUDED.owner_id,
       updated_at = NOW()`,
    [
      guild.id,
      guild.name || null,
      guild.icon || null,
      guild.owner_id || null,
      guild.command_prefix || "!",
      guild.log_channel_id || null,
    ],
  );
}

export async function getGuild(id: string): Promise<GuildData | null> {
  const result = await runSQL<GuildData>(
    `SELECT * FROM guilds WHERE id = ? LIMIT 1`,
    [id],
  );
  return result[0] || null;
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
  guild_id: string;
  channel_id: string;
  channel_name?: string | null;
  thread_id?: string | null;
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
  await runSQL(
    `INSERT INTO discord_message (
      id, guild_id, channel_id, channel_name, thread_id,
      author_id, author_username, author_global_name, author_avatar, author_bot,
      content, content_clean, type, pinned, tts, flags,
      webhook_id, application_id, interaction,
      mention_everyone, mention_users, mention_roles, mention_channels,
      attachments, embeds, stickers, components,
      reply_to_id, message_reference, edit_history,
      deleted, deleted_at, deleted_by_id, deleted_by_username, bulk_deleted,
      created_at, edited_at, indexed_at, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      content = EXCLUDED.content,
      content_clean = EXCLUDED.content_clean,
      pinned = EXCLUDED.pinned,
      edited_at = EXCLUDED.edited_at,
      attachments = EXCLUDED.attachments,
      embeds = EXCLUDED.embeds,
      components = EXCLUDED.components,
      flags = EXCLUDED.flags,
      edit_history = COALESCE(
        discord_message.edit_history || EXCLUDED.edit_history,
        EXCLUDED.edit_history
      ),
      last_updated_at = NOW()`,
    [
      msg.id,
      msg.guild_id,
      msg.channel_id,
      msg.channel_name || null,
      msg.thread_id || null,
      msg.author_id,
      msg.author_username,
      msg.author_global_name || null,
      msg.author_avatar || null,
      msg.author_bot,
      msg.content || null,
      msg.content_clean || null,
      msg.type,
      msg.pinned,
      msg.tts,
      msg.flags || 0,
      msg.webhook_id || null,
      msg.application_id || null,
      msg.interaction ? JSON.stringify(msg.interaction) : null,
      msg.mention_everyone,
      msg.mention_users ? JSON.stringify(msg.mention_users) : null,
      msg.mention_roles ? JSON.stringify(msg.mention_roles) : null,
      msg.mention_channels ? JSON.stringify(msg.mention_channels) : null,
      msg.attachments ? JSON.stringify(msg.attachments) : null,
      msg.embeds ? JSON.stringify(msg.embeds) : null,
      msg.stickers ? JSON.stringify(msg.stickers) : null,
      msg.components ? JSON.stringify(msg.components) : null,
      msg.reply_to_id || null,
      msg.message_reference ? JSON.stringify(msg.message_reference) : null,
      msg.edit_history ? JSON.stringify(msg.edit_history) : null,
      msg.deleted || false,
      msg.deleted_at?.toISOString() || null,
      msg.deleted_by_id || null,
      msg.deleted_by_username || null,
      msg.bulk_deleted || false,
      msg.created_at.toISOString(),
      msg.edited_at?.toISOString() || null,
    ],
  );
}

export async function getMessage(id: string): Promise<MessageData | null> {
  const result = await runSQL<MessageData>(
    `SELECT * FROM discord_message WHERE id = ? LIMIT 1`,
    [id],
  );
  return result[0] || null;
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

  await runSQL(
    `UPDATE discord_message SET
      content = ?,
      edited_at = ?,
      edit_history = ?,
      last_updated_at = NOW()
    WHERE id = ?`,
    [newContent, editedAt.toISOString(), JSON.stringify(newHistory), messageId],
  );
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
// Agent Config Operations
// ============================================================================

export interface AgentConfigData {
  id?: string;
  guild_id: string;
  name: string;
  command: string;
  description?: string | null;
  avatar_url?: string | null;
  color?: string | null;
  agent_binding_id: string;
  model_id?: string | null;
  system_prompt?: string | null;
  context_messages: number;
  max_tokens?: number | null;
  temperature?: number | null;
  enabled: boolean;
  created_by: string;
}

export async function createAgentConfig(
  config: AgentConfigData,
): Promise<AgentConfigData> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result = await runSQL<AgentConfigData>(
    `INSERT INTO discord_agent_config (
      id, guild_id, name, command, description, avatar_url, color,
      agent_binding_id, model_id, system_prompt, context_messages,
      max_tokens, temperature, enabled, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [
      id,
      config.guild_id,
      config.name,
      config.command.toLowerCase(),
      config.description || null,
      config.avatar_url || null,
      config.color || null,
      config.agent_binding_id,
      config.model_id || null,
      config.system_prompt || null,
      config.context_messages,
      config.max_tokens || null,
      config.temperature || null,
      config.enabled,
      now,
      now,
      config.created_by,
    ],
  );

  return result[0];
}

export async function getAgentConfig(
  guildId: string,
  command: string,
): Promise<AgentConfigData | null> {
  const result = await runSQL<AgentConfigData>(
    `SELECT * FROM discord_agent_config WHERE guild_id = ? AND command = ? LIMIT 1`,
    [guildId, command.toLowerCase()],
  );
  return result[0] || null;
}

export async function getAgentConfigById(
  id: string,
): Promise<AgentConfigData | null> {
  const result = await runSQL<AgentConfigData>(
    `SELECT * FROM discord_agent_config WHERE id = ? LIMIT 1`,
    [id],
  );
  return result[0] || null;
}

export async function listAgentConfigs(
  guildId: string,
): Promise<AgentConfigData[]> {
  return runSQL<AgentConfigData>(
    `SELECT * FROM discord_agent_config WHERE guild_id = ? ORDER BY created_at DESC`,
    [guildId],
  );
}

export async function updateAgentConfig(
  id: string,
  updates: Partial<AgentConfigData>,
): Promise<AgentConfigData | null> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    setClauses.push(`name = ?`);
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = ?`);
    params.push(updates.description);
  }
  if (updates.avatar_url !== undefined) {
    setClauses.push(`avatar_url = ?`);
    params.push(updates.avatar_url);
  }
  if (updates.color !== undefined) {
    setClauses.push(`color = ?`);
    params.push(updates.color);
  }
  if (updates.model_id !== undefined) {
    setClauses.push(`model_id = ?`);
    params.push(updates.model_id);
  }
  if (updates.system_prompt !== undefined) {
    setClauses.push(`system_prompt = ?`);
    params.push(updates.system_prompt);
  }
  if (updates.context_messages !== undefined) {
    setClauses.push(`context_messages = ?`);
    params.push(updates.context_messages);
  }
  if (updates.max_tokens !== undefined) {
    setClauses.push(`max_tokens = ?`);
    params.push(updates.max_tokens);
  }
  if (updates.temperature !== undefined) {
    setClauses.push(`temperature = ?`);
    params.push(updates.temperature);
  }
  if (updates.enabled !== undefined) {
    setClauses.push(`enabled = ?`);
    params.push(updates.enabled);
  }

  params.push(id);

  const result = await runSQL<AgentConfigData>(
    `UPDATE discord_agent_config SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`,
    params,
  );

  return result[0] || null;
}

export async function deleteAgentConfig(id: string): Promise<boolean> {
  const result = await runSQL<{ id: string }>(
    `DELETE FROM discord_agent_config WHERE id = ? RETURNING id`,
    [id],
  );
  return result.length > 0;
}

// ============================================================================
// Agent Permission Operations
// ============================================================================

export interface AgentPermissionData {
  id?: string;
  agent_config_id: string;
  type: "user" | "role" | "everyone";
  target_id?: string | null;
  allowed: boolean;
  created_by: string;
}

export async function upsertAgentPermission(
  permission: AgentPermissionData,
): Promise<void> {
  await runSQL(
    `INSERT INTO discord_agent_permission (
      id, agent_config_id, type, target_id, allowed, created_at, created_by
    ) VALUES (gen_random_uuid()::text, ?, ?, ?, ?, NOW(), ?)
    ON CONFLICT (agent_config_id, type, target_id) DO UPDATE SET
      allowed = EXCLUDED.allowed`,
    [
      permission.agent_config_id,
      permission.type,
      permission.target_id || null,
      permission.allowed,
      permission.created_by,
    ],
  );
}

export async function deleteAgentPermission(
  agentConfigId: string,
  type: string,
  targetId: string | null,
): Promise<void> {
  await runSQL(
    `DELETE FROM discord_agent_permission 
     WHERE agent_config_id = ? AND type = ? AND target_id IS NOT DISTINCT FROM ?`,
    [agentConfigId, type, targetId],
  );
}

export async function getAgentPermissions(
  agentConfigId: string,
): Promise<AgentPermissionData[]> {
  return runSQL<AgentPermissionData>(
    `SELECT * FROM discord_agent_permission WHERE agent_config_id = ?`,
    [agentConfigId],
  );
}

// ============================================================================
// Command Log Operations
// ============================================================================

export interface CommandLogData {
  id?: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  command: string;
  raw_input: string;
  parsed_args?: unknown | null;
  agent_config_id: string;
  agent_name: string;
  agent_avatar?: string | null;
  model_used?: string | null;
  context_message_ids?: string[] | null;
  context_tokens?: number | null;
  response?: string | null;
  response_tokens?: number | null;
  status: "pending" | "processing" | "completed" | "error";
  error_message?: string | null;
  started_at?: Date;
  completed_at?: Date | null;
  duration_ms?: number | null;
}

export async function createCommandLog(
  log: CommandLogData,
): Promise<CommandLogData> {
  const id = crypto.randomUUID();

  const result = await runSQL<CommandLogData>(
    `INSERT INTO discord_command_log (
      id, guild_id, channel_id, message_id, user_id, user_name, user_avatar,
      command, raw_input, parsed_args, agent_config_id, agent_name, agent_avatar,
      model_used, context_message_ids, context_tokens, response, response_tokens,
      status, error_message, started_at, completed_at, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
    RETURNING *`,
    [
      id,
      log.guild_id,
      log.channel_id,
      log.message_id,
      log.user_id,
      log.user_name,
      log.user_avatar || null,
      log.command,
      log.raw_input,
      log.parsed_args ? JSON.stringify(log.parsed_args) : null,
      log.agent_config_id,
      log.agent_name,
      log.agent_avatar || null,
      log.model_used || null,
      log.context_message_ids ? JSON.stringify(log.context_message_ids) : null,
      log.context_tokens || null,
      log.response || null,
      log.response_tokens || null,
      log.status,
      log.error_message || null,
      log.completed_at?.toISOString() || null,
      log.duration_ms || null,
    ],
  );

  return result[0];
}

export async function updateCommandLog(
  id: string,
  updates: Partial<CommandLogData>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    setClauses.push(`status = ?`);
    params.push(updates.status);
  }
  if (updates.response !== undefined) {
    setClauses.push(`response = ?`);
    params.push(updates.response);
  }
  if (updates.response_tokens !== undefined) {
    setClauses.push(`response_tokens = ?`);
    params.push(updates.response_tokens);
  }
  if (updates.error_message !== undefined) {
    setClauses.push(`error_message = ?`);
    params.push(updates.error_message);
  }
  if (updates.completed_at !== undefined) {
    setClauses.push(`completed_at = ?`);
    params.push(updates.completed_at?.toISOString() || null);
  }
  if (updates.duration_ms !== undefined) {
    setClauses.push(`duration_ms = ?`);
    params.push(updates.duration_ms);
  }
  if (updates.context_message_ids !== undefined) {
    setClauses.push(`context_message_ids = ?`);
    params.push(JSON.stringify(updates.context_message_ids));
  }
  if (updates.model_used !== undefined) {
    setClauses.push(`model_used = ?`);
    params.push(updates.model_used);
  }

  if (setClauses.length === 0) return;

  params.push(id);
  await runSQL(
    `UPDATE discord_command_log SET ${setClauses.join(", ")} WHERE id = ?`,
    params,
  );
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
