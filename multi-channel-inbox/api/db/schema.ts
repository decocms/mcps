import type { Env } from "../types/env.ts";
import { runSQL } from "./postgres.ts";

const CREATE_INBOX_SOURCE = `
CREATE TABLE IF NOT EXISTS inbox_source (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN ('slack', 'discord', 'gmail')),
  connection_id TEXT NOT NULL,
  external_channel_id TEXT,
  external_channel_name TEXT,
  gmail_label TEXT,
  gmail_query TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const CREATE_INBOX_CONVERSATION = `
CREATE TABLE IF NOT EXISTS inbox_conversation (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES inbox_source(id),
  source_type TEXT NOT NULL,
  external_thread_id TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'archived')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  category TEXT,
  assignee TEXT,
  customer_name TEXT,
  customer_id TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  ai_summary TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const CREATE_INBOX_MESSAGE = `
CREATE TABLE IF NOT EXISTS inbox_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES inbox_conversation(id),
  external_message_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  sender_name TEXT,
  sender_id TEXT,
  content TEXT NOT NULL,
  content_html TEXT,
  has_attachments BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const CREATE_INBOX_GMAIL_SYNC_STATE = `
CREATE TABLE IF NOT EXISTS inbox_gmail_sync_state (
  source_id TEXT PRIMARY KEY REFERENCES inbox_source(id),
  last_history_id TEXT,
  last_poll_at TIMESTAMPTZ
)`;

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_inbox_conversation_status ON inbox_conversation(status)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_conversation_source ON inbox_conversation(source_id)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_conversation_last_msg ON inbox_conversation(last_message_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_conversation_priority ON inbox_conversation(priority)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_message_conversation ON inbox_message(conversation_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_message_external ON inbox_message(external_message_id)",
  "CREATE INDEX IF NOT EXISTS idx_inbox_source_type ON inbox_source(source_type, enabled)",
];

export async function ensureSchema(env: Env): Promise<void> {
  await runSQL(env, CREATE_INBOX_SOURCE);
  await runSQL(env, CREATE_INBOX_CONVERSATION);
  await runSQL(env, CREATE_INBOX_MESSAGE);
  await runSQL(env, CREATE_INBOX_GMAIL_SYNC_STATE);

  for (const index of INDEXES) {
    await runSQL(env, index);
  }

  console.log("[DB] Schema ensured successfully");
}
