-- Grain Meeting Recordings index table
-- Run this manually in Supabase SQL Editor
-- To rename an existing table without data loss:
--   ALTER TABLE grain_recordings RENAME TO grain_meeting_recordings;

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
  user_id               TEXT        NOT NULL DEFAULT '',
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
