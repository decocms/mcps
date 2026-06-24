-- Grain Meeting Recordings index table
-- Run this manually in Supabase SQL Editor
-- To migrate an existing table without data loss:
--   ALTER TABLE grain_recordings RENAME TO grain_meeting_recordings;
--   ALTER TABLE grain_meeting_recordings ALTER COLUMN user_id DROP NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS grain_meeting_recordings;

CREATE TABLE grain_meeting_recordings (
  id                    TEXT PRIMARY KEY,
  title                 TEXT,
  url                   TEXT,
  start_datetime        TIMESTAMPTZ,
  end_datetime          TIMESTAMPTZ,
  public_thumbnail_url  TEXT,
  owners                TEXT[]      DEFAULT '{}',
  tags                  TEXT[]      DEFAULT '{}',
  participants          JSONB       DEFAULT '[]',
  participants_text     TEXT,
  intelligence_notes_md TEXT,
  user_id               TEXT,
  webhook_type          TEXT        NOT NULL,
  raw_payload           JSONB       NOT NULL,
  indexed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast date-range filtering
CREATE INDEX idx_grain_meeting_rec_start
  ON grain_meeting_recordings (start_datetime DESC);

-- Fuzzy title search
CREATE INDEX idx_grain_meeting_rec_title_trgm
  ON grain_meeting_recordings USING gin (title gin_trgm_ops);

-- Search inside participants text (names + emails flattened)
CREATE INDEX idx_grain_meeting_rec_participants_trgm
  ON grain_meeting_recordings USING gin (participants_text gin_trgm_ops);

-- Search inside AI notes
CREATE INDEX idx_grain_meeting_rec_notes_trgm
  ON grain_meeting_recordings USING gin (intelligence_notes_md gin_trgm_ops);

-- Filter by tag
CREATE INDEX idx_grain_meeting_rec_tags
  ON grain_meeting_recordings USING gin (tags);

-- Filter by owner
CREATE INDEX idx_grain_meeting_rec_owners
  ON grain_meeting_recordings USING gin (owners);

-- Row Level Security
ALTER TABLE grain_meeting_recordings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Trigger credentials table (persists TRIGGER_CONFIGURE state across restarts)
-- ============================================================================

DROP TABLE IF EXISTS grain_trigger_credentials;

CREATE TABLE grain_trigger_credentials (
  connection_id        TEXT PRIMARY KEY,
  callback_url         TEXT NOT NULL,
  callback_token       TEXT NOT NULL,
  active_trigger_types TEXT[] NOT NULL DEFAULT '{}',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE grain_trigger_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grain_trigger_anon_select"
  ON grain_trigger_credentials FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "grain_trigger_anon_insert"
  ON grain_trigger_credentials FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "grain_trigger_anon_update"
  ON grain_trigger_credentials FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "grain_trigger_anon_delete"
  ON grain_trigger_credentials FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "grain_meeting_anon_select"
  ON grain_meeting_recordings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "grain_meeting_anon_insert"
  ON grain_meeting_recordings FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "grain_meeting_anon_update"
  ON grain_meeting_recordings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
