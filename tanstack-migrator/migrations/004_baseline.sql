-- Baseline metrics: capture production site state before migration starts
-- (run parity --prod <prodUrl> --cand <prodUrl> → snapshot of Fresh site's Lighthouse/SEO data)
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS baseline_score NUMERIC;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS baseline_measured_at TIMESTAMPTZ;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS baseline_report_prefix TEXT;
ALTER TABLE sitemig_sites ADD COLUMN IF NOT EXISTS baseline_verdict JSONB;
