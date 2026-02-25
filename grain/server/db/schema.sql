-- Grain Recordings index table
-- Run this manually in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS grain_recordings;

CREATE TABLE grain_recordings (
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
  user_id               TEXT        NOT NULL,
  webhook_type          TEXT        NOT NULL,
  raw_payload           JSONB       NOT NULL,
  indexed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast date-range filtering
CREATE INDEX idx_grain_rec_start
  ON grain_recordings (start_datetime DESC);

-- Fuzzy title search
CREATE INDEX idx_grain_rec_title_trgm
  ON grain_recordings USING gin (title gin_trgm_ops);

-- Search inside participants text (names + emails flattened)
CREATE INDEX idx_grain_rec_participants_trgm
  ON grain_recordings USING gin (participants_text gin_trgm_ops);

-- Search inside AI notes
CREATE INDEX idx_grain_rec_notes_trgm
  ON grain_recordings USING gin (intelligence_notes_md gin_trgm_ops);

-- Filter by tag
CREATE INDEX idx_grain_rec_tags
  ON grain_recordings USING gin (tags);

-- Filter by owner
CREATE INDEX idx_grain_rec_owners
  ON grain_recordings USING gin (owners);
