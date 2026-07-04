-- TanStack Migrator MCP — schema.
-- Holds per-connection mesh context plus the migration queue state machine.
-- Tokens (mesh api key, GitHub refresh grants) are plaintext — the
-- service-role-only RLS policy is the only protection. Never expose these
-- tables directly via tools.

-- ============================================================================
-- sitemig_connections — per-connection mesh context snapshot (onChange)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitemig_connections (
  connection_id   TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mesh_url        TEXT NOT NULL,
  mesh_token      TEXT,             -- last-seen request JWT (may expire)
  mesh_api_key    TEXT,             -- durable org API key, preferred
  state           JSONB,            -- persistable StateSchema values (bindings as {__type,value})
  configured_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sitemig_connections_org
  ON sitemig_connections(organization_id);

-- ============================================================================
-- sitemig_sites — one row per site registered for migration (FIFO by created_at)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitemig_sites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id       TEXT NOT NULL REFERENCES sitemig_connections(connection_id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                    -- slug, e.g. "granadobr"
  source_repo         TEXT NOT NULL,                    -- "deco-sites/granadobr"
  source_branch       TEXT NOT NULL DEFAULT 'main',
  prod_url            TEXT NOT NULL,                    -- https://www.granado.com.br
  target_repo         TEXT,                             -- "deco-sites/granadobr-tanstack"

  -- state machine
  status              TEXT NOT NULL DEFAULT 'queued',
  -- queued | creating_repo | provisioning_sandbox | migrating | installing_sync
  -- | validating | deploying_cf | done | needs_human | paused | failed | archived
  phase_detail        TEXT,
  error               TEXT,
  needs_human_reason  TEXT,
  resume_status       TEXT,                             -- status to resume into after paused

  -- parity loop
  parity_score        NUMERIC,
  parity_target       INT NOT NULL DEFAULT 95,
  max_iterations      INT NOT NULL DEFAULT 8,
  no_improve_limit    INT NOT NULL DEFAULT 3,
  iterations_done     INT NOT NULL DEFAULT 0,
  no_improve_count    INT NOT NULL DEFAULT 0,
  best_score          NUMERIC,

  -- sandbox
  sandbox_handle      TEXT,                             -- vmId from VM_START
  sandbox_preview_url TEXT,
  sandbox_session_id  TEXT,                             -- in-flight decopilot session marker
  virtual_mcp_id      TEXT,                             -- mesh project/agent the sandbox belongs to

  -- github grant (from MINT_REPO_TOKEN): re-mint ghs_ tokens without user login
  gh_refresh_token    TEXT,
  gh_token_endpoint   TEXT,
  gh_client_id        TEXT,

  -- cloudflare
  cf_project_name     TEXT,
  cf_deploy_url       TEXT,

  -- worker lease (protects against double-processing during pod overlap)
  lease_owner         TEXT,
  lease_expires_at    TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  last_progress_at    TIMESTAMPTZ,                      -- watchdog input

  UNIQUE (connection_id, source_repo)
);

CREATE INDEX IF NOT EXISTS idx_sitemig_sites_status
  ON sitemig_sites(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sitemig_sites_conn
  ON sitemig_sites(connection_id);

-- ============================================================================
-- sitemig_runs — one row per phase attempt / parity iteration
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitemig_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sitemig_sites(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,     -- migrate | parity | fix_iteration | install_sync | deploy_cf
  iteration       INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,     -- running | succeeded | failed
  parity_score    NUMERIC,
  summary         JSONB,             -- trimmed report.json: verdict, topIssues<=10, perPage pctDiff
  artifact_prefix TEXT,              -- object-storage key prefix for report.html/json + heatmaps
  logs_tail       TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sitemig_runs_site
  ON sitemig_runs(site_id, started_at DESC);

-- ============================================================================
-- sitemig_events — activity feed shown in the dashboard
-- ============================================================================
CREATE TABLE IF NOT EXISTS sitemig_events (
  id         BIGSERIAL PRIMARY KEY,
  site_id    UUID REFERENCES sitemig_sites(id) ON DELETE CASCADE,
  level      TEXT NOT NULL DEFAULT 'info',   -- info | warn | error
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sitemig_events_site
  ON sitemig_events(site_id, id DESC);

-- ============================================================================
-- RLS: service_role only, on every table
-- ============================================================================
ALTER TABLE sitemig_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON sitemig_connections;
CREATE POLICY "service_role_all" ON sitemig_connections
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE sitemig_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON sitemig_sites;
CREATE POLICY "service_role_all" ON sitemig_sites
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE sitemig_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON sitemig_runs;
CREATE POLICY "service_role_all" ON sitemig_runs
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE sitemig_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON sitemig_events;
CREATE POLICY "service_role_all" ON sitemig_events
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- v0.4.0: preview link only shows when the dev server actually answers
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS preview_ready BOOLEAN NOT NULL DEFAULT false;
