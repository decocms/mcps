-- v0.12.0: per-site COGS snapshot cache (from Grafana) + before-migration cost

-- Cached top sites by monthly COGS, refreshed ~every 12h (see server/db/cost.ts).
CREATE TABLE IF NOT EXISTS sitemig_cost_snapshot (
  connection_id text NOT NULL,
  site_name text NOT NULL,
  cogs_usd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  measured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, site_name)
);

CREATE INDEX IF NOT EXISTS sitemig_cost_snapshot_conn_cost_idx
  ON sitemig_cost_snapshot (connection_id, cogs_usd DESC);

-- Per-site "antes" (Deno/k8s COGS captured at baseline time).
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS cost_before_usd numeric;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS cost_before_at timestamptz;
