-- ============================================================================
-- SUPABASE SETUP - Deco AI Gateway MCP
-- ============================================================================
--
-- PART 0: Drop existing policies (safe re-run)
-- PART 1: Create tables
-- PART 2: Row Level Security (RLS) policies
-- PART 3: Migrations (for existing tables)
--
-- IMPORTANT: llm_gateway_connections MUST NEVER be accessed via MCP tools!
-- It contains encrypted API keys and is for internal code access only.
--
-- ============================================================================

-- ============================================================================
-- PART 0: DROP EXISTING POLICIES
-- ============================================================================
-- Removes all existing policies to allow idempotent re-execution

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN (
      'llm_gateway_connections'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- PART 1: CREATE TABLES
-- ============================================================================

-- 1. llm_gateway_connections (config and encrypted API keys)
CREATE TABLE IF NOT EXISTS llm_gateway_connections (
  connection_id        TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL UNIQUE,
  mesh_url             TEXT NOT NULL,
  openrouter_key_name  TEXT,                          -- Key name in OpenRouter (e.g. decocms-mesh-org-acme-abc123)
  openrouter_key_hash  TEXT,                          -- Hash returned by OpenRouter (used to revoke without exposing the key)
  encrypted_api_key    TEXT,                          -- API key encrypted with AES-256-GCM (base64)
  encryption_iv        TEXT,                          -- 12-byte Initialization Vector (hex)
  encryption_tag       TEXT,                          -- 16-byte auth tag for integrity verification (hex)
  configured_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_gw_org
  ON llm_gateway_connections(organization_id);

CREATE INDEX IF NOT EXISTS idx_llm_gw_key_hash
  ON llm_gateway_connections(openrouter_key_hash);

CREATE INDEX IF NOT EXISTS idx_llm_gw_updated
  ON llm_gateway_connections(updated_at DESC);

COMMENT ON TABLE llm_gateway_connections IS
  '⚠️  SENSITIVE: Contains encrypted OpenRouter API keys. NEVER create MCP tools that access this table. Internal code access only.';

COMMENT ON COLUMN llm_gateway_connections.encrypted_api_key IS
  'OpenRouter API key encrypted with AES-256-GCM. Decrypt only in server memory.';

COMMENT ON COLUMN llm_gateway_connections.openrouter_key_hash IS
  'API key hash returned by OpenRouter. Used to revoke the key without decrypting it.';

-- ============================================================================
-- PART 2: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- ============================================================================
-- 1. LLM_GATEWAY_CONNECTIONS - INTERNAL ACCESS ONLY
-- ============================================================================

-- ⚠️  IMPORTANT: NEVER create MCP tools that access this table!
-- Contains encrypted API keys. Access via internal code only.
-- Protection: enforced by discipline of not creating tools for this table.

-- RLS enabled; only service_role (used by server) can access this table.
-- The anon key (public) has zero access — the table is invisible via REST API.
ALTER TABLE llm_gateway_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to llm_gateway_connections"
  ON llm_gateway_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PERMISSIONS SUMMARY
-- ============================================================================

/*
┌──────────────────────────────┬───────┬────────┬────────┬────────┐
│ Table                        │ READ  │ INSERT │ UPDATE │ DELETE │
├──────────────────────────────┼───────┼────────┼────────┼────────┤
│ llm_gateway_connections      │  🔒   │   🔒   │   🔒   │   🔒   │ <- NO TOOLS!
└──────────────────────────────┴───────┴────────┴────────┴────────┘

IMPORTANT:
- llm_gateway_connections = NEVER create tools that access this! Internal code only.
- API keys are encrypted with AES-256-GCM before being stored in the database
- ENCRYPTION_KEY never goes to the database, stays only in the environment variable
- openrouter_key_hash allows revoking the key in OpenRouter without exposing it
*/

-- ============================================================================
-- PART 3: MIGRATIONS (for existing tables)
-- ============================================================================

-- Migration: Add openrouter_key_hash column (if table already exists without it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
    AND column_name = 'openrouter_key_hash'
  ) THEN
    ALTER TABLE llm_gateway_connections
    ADD COLUMN openrouter_key_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_llm_gw_key_hash
      ON llm_gateway_connections(openrouter_key_hash);

    RAISE NOTICE 'Migration: Added column openrouter_key_hash to llm_gateway_connections';
  END IF;
END $$;

-- Migration: Add openrouter_key_name column (if table already exists without it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
    AND column_name = 'openrouter_key_name'
  ) THEN
    ALTER TABLE llm_gateway_connections
    ADD COLUMN openrouter_key_name TEXT;

    RAISE NOTICE 'Migration: Added column openrouter_key_name to llm_gateway_connections';
  END IF;
END $$;

-- ============================================================================
-- SETUP COMPLETE! ✅
-- ============================================================================

-- Configure the environment variables:
-- export SUPABASE_URL=https://your-project.supabase.co
-- export SUPABASE_ANON_KEY=your-anon-key
-- export ENCRYPTION_KEY=<64 hex chars>   (generate with: openssl rand -hex 32)
-- export OPENROUTER_MANAGEMENT_KEY=<OpenRouter management key>
--
-- ⚠️  SECURITY RULE:
-- NEVER create MCP tools that access llm_gateway_connections!
-- This table is for internal code only (encrypted API keys)
