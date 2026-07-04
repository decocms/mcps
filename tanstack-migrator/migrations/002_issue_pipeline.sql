-- v0.5.0 — issue-driven pipeline: GitHub issues as durable memory between
-- short bounded sessions, work on a branch + PR (merge = go-live).
-- Additive only; safe on live data.

-- issue backlog caches (source of truth is GitHub; these feed the dashboard)
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS issues_total INT NOT NULL DEFAULT 0;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS issues_open INT NOT NULL DEFAULT 0;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS issues_closed INT NOT NULL DEFAULT 0;

-- fix-session budget (separate from parity iterations)
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS fix_sessions_done INT NOT NULL DEFAULT 0;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS max_fix_sessions INT NOT NULL DEFAULT 20;

-- migration lives on a branch with a PR; human merge = go-live
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS work_branch TEXT NOT NULL DEFAULT 'migration/tanstack';
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS pr_number INT;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS pr_url TEXT;

-- multi-turn sessions: one decopilot thread per phase, reused across retries
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS phase_thread_id TEXT;

-- accumulated session cost (USD) from MONITORING_THREAD_USAGE
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS cost_total NUMERIC NOT NULL DEFAULT 0;

-- per-run structured telemetry: {usage, commands[], issues: {taken/resolved/blocked}}
ALTER TABLE sitemig_runs ADD COLUMN IF NOT EXISTS meta JSONB;
