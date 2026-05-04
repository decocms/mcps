-- Discord (events) MCP — connections table.
-- Stores per-connection bot config. Bot token is plaintext — protect via RLS
-- (only service role allowed to SELECT) and never expose this table via tools.

CREATE TABLE IF NOT EXISTS discord2_connections (
  connection_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mesh_url TEXT NOT NULL,
  mesh_token TEXT,
  mesh_api_key TEXT,
  bot_token TEXT NOT NULL,
  discord_public_key TEXT,
  discord_application_id TEXT,
  authorized_guilds TEXT[],
  state JSONB,
  configured_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord2_connections_org
  ON discord2_connections(organization_id);

CREATE INDEX IF NOT EXISTS idx_discord2_connections_updated
  ON discord2_connections(updated_at DESC);

ALTER TABLE discord2_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON discord2_connections;
CREATE POLICY "service_role_all" ON discord2_connections
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
