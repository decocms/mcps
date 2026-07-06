-- v0.11.0: per-site assignee (GitHub user tracking)
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS assignee_login TEXT;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS assignee_avatar_url TEXT;
