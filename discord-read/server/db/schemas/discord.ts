/**
 * Discord Schema Queries
 *
 * PostgreSQL table definitions for Discord MCP.
 * These are used by the DATABASE binding (not Prisma) for MCP tools.
 */

// ============================================================================
// Messages Table
// ============================================================================

export const messagesTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_message (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  channel_type INTEGER,
  parent_channel_id TEXT,
  thread_id TEXT,
  
  -- Author info
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_global_name TEXT,
  author_avatar TEXT,
  author_bot BOOLEAN DEFAULT FALSE,
  
  -- Content
  content TEXT,
  content_clean TEXT,
  
  -- Metadata
  type INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  tts BOOLEAN DEFAULT FALSE,
  flags INTEGER DEFAULT 0,
  
  -- Webhook/Application/Interaction
  webhook_id TEXT,
  application_id TEXT,
  interaction JSONB,
  
  -- Mentions
  mention_everyone BOOLEAN DEFAULT FALSE,
  mention_users JSONB,
  mention_roles JSONB,
  mention_channels JSONB,
  
  -- Attachments and embeds
  attachments JSONB,
  embeds JSONB,
  stickers JSONB,
  components JSONB,
  
  -- Reply/Thread/Reference
  reply_to_id TEXT,
  message_reference JSONB,
  
  -- Edit tracking
  edit_history JSONB,
  
  -- Delete tracking
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT,
  deleted_by_username TEXT,
  bulk_deleted BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  edited_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
)
`;

export const messagesTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_message_guild ON discord_message(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_channel ON discord_message(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_author ON discord_message(author_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_created ON discord_message(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_message_thread ON discord_message(thread_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_reply ON discord_message(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_deleted ON discord_message(deleted) WHERE deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_discord_message_webhook ON discord_message(webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discord_message_edited ON discord_message(edited_at) WHERE edited_at IS NOT NULL;
`;

// ============================================================================
// Channels/Threads Table
// ============================================================================

export const channelsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_channel (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  
  -- Channel info
  name TEXT NOT NULL,
  type INTEGER NOT NULL,
  position INTEGER,
  
  -- Hierarchy
  parent_id TEXT,
  category_name TEXT,
  
  -- Thread specific
  owner_id TEXT,
  message_count INTEGER,
  member_count INTEGER,
  
  -- Forum/Thread metadata
  topic TEXT,
  nsfw BOOLEAN DEFAULT FALSE,
  rate_limit_per_user INTEGER,
  
  -- Archiving (for threads)
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  auto_archive_duration INTEGER,
  locked BOOLEAN DEFAULT FALSE,
  
  -- Permissions
  permission_overwrites JSONB,
  
  -- Status
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
)
`;

export const channelsTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_channel_guild ON discord_channel(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_parent ON discord_channel(parent_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_type ON discord_channel(type);
CREATE INDEX IF NOT EXISTS idx_discord_channel_deleted ON discord_channel(deleted) WHERE deleted = TRUE;
`;

// Channel types for reference:
// 0 = GUILD_TEXT, 1 = DM, 2 = GUILD_VOICE, 4 = GUILD_CATEGORY
// 5 = GUILD_ANNOUNCEMENT, 10 = ANNOUNCEMENT_THREAD, 11 = PUBLIC_THREAD
// 12 = PRIVATE_THREAD, 13 = GUILD_STAGE_VOICE, 14 = GUILD_DIRECTORY
// 15 = GUILD_FORUM, 16 = GUILD_MEDIA

// ============================================================================
// Guild Members Table
// ============================================================================

export const membersTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_member (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  
  -- User info snapshot
  username TEXT NOT NULL,
  global_name TEXT,
  avatar TEXT,
  bot BOOLEAN DEFAULT FALSE,
  
  -- Member info
  nickname TEXT,
  display_avatar TEXT,
  roles JSONB,
  
  -- Permissions
  permissions TEXT,
  
  -- Status
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  is_member BOOLEAN DEFAULT TRUE,
  
  -- Moderation
  timed_out_until TIMESTAMPTZ,
  
  -- Timestamps
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(guild_id, user_id)
)
`;

export const membersTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_member_guild ON discord_member(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_member_user ON discord_member(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_member_active ON discord_member(is_member) WHERE is_member = TRUE;
CREATE INDEX IF NOT EXISTS idx_discord_member_joined ON discord_member(joined_at DESC);
`;

// ============================================================================
// Voice States Table (who's in voice channels)
// ============================================================================

export const voiceStatesTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_voice_state (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  user_id TEXT NOT NULL,
  
  -- State
  session_id TEXT,
  deaf BOOLEAN DEFAULT FALSE,
  mute BOOLEAN DEFAULT FALSE,
  self_deaf BOOLEAN DEFAULT FALSE,
  self_mute BOOLEAN DEFAULT FALSE,
  self_video BOOLEAN DEFAULT FALSE,
  self_stream BOOLEAN DEFAULT FALSE,
  suppress BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  -- Is currently in channel
  active BOOLEAN DEFAULT TRUE
)
`;

export const voiceStatesTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_voice_guild ON discord_voice_state(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_voice_channel ON discord_voice_state(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_voice_user ON discord_voice_state(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_voice_active ON discord_voice_state(active) WHERE active = TRUE;
`;

// ============================================================================
// Audit Log Table (moderation actions)
// ============================================================================

export const auditLogTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_audit_log (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  
  -- Action info
  action_type INTEGER NOT NULL,
  target_id TEXT,
  target_type TEXT,
  
  -- Executor (who did it)
  executor_id TEXT,
  executor_username TEXT,
  
  -- Changes
  changes JSONB,
  reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
)
`;

export const auditLogTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_audit_guild ON discord_audit_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_action ON discord_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_discord_audit_executor ON discord_audit_log(executor_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_target ON discord_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_created ON discord_audit_log(created_at DESC);
`;

// ============================================================================
// Message Reactions Table
// ============================================================================

export const reactionsTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_message_reaction (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id TEXT NOT NULL,
  
  -- Emoji info
  emoji_id TEXT,
  emoji_name TEXT NOT NULL,
  emoji_animated BOOLEAN DEFAULT FALSE,
  
  -- Counts
  count INTEGER DEFAULT 1,
  count_burst INTEGER DEFAULT 0,
  count_normal INTEGER DEFAULT 0,
  
  -- Users who reacted
  user_ids JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(message_id, emoji_id, emoji_name)
)
`;

export const reactionsTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_reaction_message ON discord_message_reaction(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_reaction_emoji ON discord_message_reaction(emoji_name);
`;

// ============================================================================
// Agent Config Table
// ============================================================================

export const agentConfigTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_agent_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  guild_id TEXT NOT NULL,
  
  -- Identification
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT,
  
  -- Visual
  avatar_url TEXT,
  color TEXT,
  
  -- Binding config
  agent_binding_id TEXT NOT NULL,
  model_id TEXT,
  system_prompt TEXT,
  
  -- Settings
  context_messages INTEGER DEFAULT 10,
  max_tokens INTEGER,
  temperature REAL,
  
  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,
  
  UNIQUE(guild_id, command)
)
`;

export const agentConfigTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_agent_config_guild ON discord_agent_config(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_agent_config_command ON discord_agent_config(command);
CREATE INDEX IF NOT EXISTS idx_discord_agent_config_enabled ON discord_agent_config(enabled);
`;

// ============================================================================
// Agent Permission Table
// ============================================================================

export const agentPermissionTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_agent_permission (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_config_id TEXT NOT NULL REFERENCES discord_agent_config(id) ON DELETE CASCADE,
  
  -- Permission type
  type TEXT NOT NULL CHECK(type IN ('user', 'role', 'everyone')),
  target_id TEXT,
  
  -- Permission value
  allowed BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,
  
  UNIQUE(agent_config_id, type, target_id)
)
`;

export const agentPermissionTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_agent_permission_config ON discord_agent_permission(agent_config_id);
CREATE INDEX IF NOT EXISTS idx_discord_agent_permission_type ON discord_agent_permission(type);
`;

// ============================================================================
// Command Log Table
// ============================================================================

export const commandLogTableIdempotentQuery = `
CREATE TABLE IF NOT EXISTS discord_command_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  
  -- User who executed
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  
  -- Command info
  command TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  parsed_args JSONB,
  
  -- Agent used
  agent_config_id TEXT NOT NULL REFERENCES discord_agent_config(id),
  agent_name TEXT NOT NULL,
  agent_avatar TEXT,
  model_used TEXT,
  
  -- Context sent
  context_message_ids JSONB,
  context_tokens INTEGER,
  
  -- Response
  response TEXT,
  response_tokens INTEGER,
  
  -- Status
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'error')) DEFAULT 'pending',
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
)
`;

export const commandLogTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_command_log_guild ON discord_command_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_command_log_channel ON discord_command_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_command_log_user ON discord_command_log(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_command_log_agent ON discord_command_log(agent_config_id);
CREATE INDEX IF NOT EXISTS idx_discord_command_log_status ON discord_command_log(status);
CREATE INDEX IF NOT EXISTS idx_discord_command_log_started ON discord_command_log(started_at DESC);
`;

// ============================================================================
// Migration Query (add new columns to existing tables)
// ============================================================================

export const messagesMigrationQuery = `
-- Add new columns if they don't exist (idempotent)
DO $$ 
BEGIN
  -- Add flags column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'flags') THEN
    ALTER TABLE discord_message ADD COLUMN flags INTEGER DEFAULT 0;
  END IF;
  
  -- Add webhook_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'webhook_id') THEN
    ALTER TABLE discord_message ADD COLUMN webhook_id TEXT;
  END IF;
  
  -- Add application_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'application_id') THEN
    ALTER TABLE discord_message ADD COLUMN application_id TEXT;
  END IF;
  
  -- Add interaction column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'interaction') THEN
    ALTER TABLE discord_message ADD COLUMN interaction JSONB;
  END IF;
  
  -- Add message_reference column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'message_reference') THEN
    ALTER TABLE discord_message ADD COLUMN message_reference JSONB;
  END IF;
  
  -- Add edit_history column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'edit_history') THEN
    ALTER TABLE discord_message ADD COLUMN edit_history JSONB;
  END IF;
  
  -- Add deleted column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'deleted') THEN
    ALTER TABLE discord_message ADD COLUMN deleted BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add deleted_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'deleted_at') THEN
    ALTER TABLE discord_message ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  
  -- Add deleted_by_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'deleted_by_id') THEN
    ALTER TABLE discord_message ADD COLUMN deleted_by_id TEXT;
  END IF;
  
  -- Add deleted_by_username column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'deleted_by_username') THEN
    ALTER TABLE discord_message ADD COLUMN deleted_by_username TEXT;
  END IF;
  
  -- Add bulk_deleted column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'bulk_deleted') THEN
    ALTER TABLE discord_message ADD COLUMN bulk_deleted BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add last_updated_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'last_updated_at') THEN
    ALTER TABLE discord_message ADD COLUMN last_updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  
  -- Add channel_type column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'channel_type') THEN
    ALTER TABLE discord_message ADD COLUMN channel_type INTEGER;
  END IF;
  
  -- Add parent_channel_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discord_message' AND column_name = 'parent_channel_id') THEN
    ALTER TABLE discord_message ADD COLUMN parent_channel_id TEXT;
  END IF;
END $$;
`;

// ============================================================================
// Export All Queries
// ============================================================================

export const discordQueries = {
  messages: {
    idempotent: messagesTableIdempotentQuery,
    indexes: messagesTableIndexesQuery,
    migration: messagesMigrationQuery,
  },
  channels: {
    idempotent: channelsTableIdempotentQuery,
    indexes: channelsTableIndexesQuery,
  },
  members: {
    idempotent: membersTableIdempotentQuery,
    indexes: membersTableIndexesQuery,
  },
  voiceStates: {
    idempotent: voiceStatesTableIdempotentQuery,
    indexes: voiceStatesTableIndexesQuery,
  },
  auditLog: {
    idempotent: auditLogTableIdempotentQuery,
    indexes: auditLogTableIndexesQuery,
  },
  reactions: {
    idempotent: reactionsTableIdempotentQuery,
    indexes: reactionsTableIndexesQuery,
  },
  agentConfig: {
    idempotent: agentConfigTableIdempotentQuery,
    indexes: agentConfigTableIndexesQuery,
  },
  agentPermission: {
    idempotent: agentPermissionTableIdempotentQuery,
    indexes: agentPermissionTableIndexesQuery,
  },
  commandLog: {
    idempotent: commandLogTableIdempotentQuery,
    indexes: commandLogTableIndexesQuery,
  },
};
