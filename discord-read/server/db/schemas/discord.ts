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
  
  -- Reply/Thread
  reply_to_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  edited_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
)
`;

export const messagesTableIndexesQuery = `
CREATE INDEX IF NOT EXISTS idx_discord_message_guild ON discord_message(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_channel ON discord_message(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_author ON discord_message(author_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_created ON discord_message(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_message_thread ON discord_message(thread_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_reply ON discord_message(reply_to_id);
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
// Export All Queries
// ============================================================================

export const discordQueries = {
  messages: {
    idempotent: messagesTableIdempotentQuery,
    indexes: messagesTableIndexesQuery,
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
