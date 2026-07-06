-- v0.9.0: backlog (draft status) + priority ordering
-- "draft" is a new status value — stored as text, no constraint change needed.
-- queue_position drives FIFO-with-priority for draft + queued sites.

ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS queue_position integer;

CREATE INDEX IF NOT EXISTS sitemig_sites_queue_pos_idx
  ON sitemig_sites(connection_id, queue_position ASC NULLS LAST);
