#!/usr/bin/env bun
/**
 * Backfill script — fetches all Grain recordings not yet in grain_meeting_recordings
 * and upserts them into Supabase.
 *
 * Usage: bun run scripts/backfill.ts
 */

import { createClient } from "@supabase/supabase-js";

const GRAIN_TOKEN = process.env.GRAIN_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!GRAIN_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing env vars: GRAIN_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface GrainRecording {
  id: string;
  title?: string;
  url?: string;
  start_datetime?: string;
  end_datetime?: string;
  public_thumbnail_url?: string;
  owners?: string[];
  tags?: { name?: string; value?: string }[] | string[];
  intelligence_notes_md?: string;
}

function normalizeTags(tags: GrainRecording["tags"]): string[] {
  if (!tags || tags.length === 0) return [];
  if (typeof tags[0] === "string") return tags as string[];
  return (tags as { name?: string; value?: string }[])
    .map((t) => t.name ?? t.value ?? "")
    .filter(Boolean);
}

async function fetchPage(
  cursor?: string,
): Promise<{ recordings: GrainRecording[]; cursor?: string }> {
  const url = new URL("https://api.grain.com/_/public-api/recordings");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${GRAIN_TOKEN}` },
  });
  if (!res.ok)
    throw new Error(`Grain API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertBatch(recordings: GrainRecording[]) {
  const rows = recordings.map((r) => ({
    id: r.id,
    title: r.title ?? null,
    url: r.url ?? null,
    start_datetime: r.start_datetime ?? null,
    end_datetime: r.end_datetime ?? null,
    public_thumbnail_url: r.public_thumbnail_url ?? null,
    owners: r.owners ?? [],
    tags: normalizeTags(r.tags),
    participants: [],
    participants_text: null,
    intelligence_notes_md: r.intelligence_notes_md ?? null,
    user_id: null,
    webhook_type: "recording_added",
    raw_payload: r,
    indexed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error, count } = await supabase
    .from("grain_meeting_recordings")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
  return rows.length;
}

async function main() {
  console.log("Starting Grain recordings backfill...");

  let cursor: string | undefined;
  let page = 0;
  let total = 0;
  let skipped = 0;

  do {
    page++;
    const { recordings, cursor: nextCursor } = await fetchPage(cursor);

    if (recordings.length === 0) break;

    const oldest = recordings.at(-1)?.start_datetime;
    const newest = recordings[0]?.start_datetime;
    console.log(
      `Page ${page}: ${recordings.length} recordings [${oldest} → ${newest}]`,
    );

    const inserted = await upsertBatch(recordings);
    total += recordings.length;

    cursor = nextCursor;

    // Small delay to avoid rate limiting
    if (cursor) await new Promise((r) => setTimeout(r, 200));
  } while (cursor);

  console.log(
    `\nDone. Fetched ${total} recordings (${skipped} skipped as existing).`,
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
