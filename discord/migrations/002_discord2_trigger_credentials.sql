-- Discord (events) MCP — trigger callback credentials.
-- Stores callback URLs the @decocms/runtime/triggers system uses to deliver
-- events to Studio agents. One row per Mesh connection.

CREATE TABLE IF NOT EXISTS discord2_trigger_credentials (
  connection_id TEXT PRIMARY KEY,
  callback_url TEXT NOT NULL,
  callback_token TEXT NOT NULL,
  active_trigger_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE discord2_trigger_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON discord2_trigger_credentials;
CREATE POLICY "service_role_all" ON discord2_trigger_credentials
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
