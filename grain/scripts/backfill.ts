#!/usr/bin/env bun
/**
 * Backfill — indexes Grain recordings into grain_meeting_recordings (v2 API),
 * with participants and the AI summary, the same row the webhook writes.
 * Existing rows are updated.
 *
 * Usage: GRAIN_TOKEN=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   bun run scripts/backfill.ts [--since 2026-09-30]
 */
import { createClient } from "@supabase/supabase-js";
import {
  GRAIN_API_VERSION,
  GRAIN_BASE_URL,
  INDEX_INCLUDE,
} from "../server/constants.ts";
import { type GrainRecordingV2, toDetails } from "../server/lib/types.ts";

const GRAIN_TOKEN = process.env.GRAIN_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!GRAIN_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing env vars: GRAIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const sinceArg = process.argv.indexOf("--since");
const since = sinceArg > 0 ? process.argv[sinceArg + 1] : undefined;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchPage(
  cursor?: string,
): Promise<{ recordings: GrainRecordingV2[]; cursor: string | null }> {
  const res = await fetch(`${GRAIN_BASE_URL}/recordings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GRAIN_TOKEN}`,
      "Public-Api-Version": GRAIN_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(cursor ? { cursor } : {}),
      filter: since ? { after_datetime: since } : {},
      include: INDEX_INCLUDE,
    }),
  });
  if (!res.ok)
    throw new Error(`Grain API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertBatch(recordings: GrainRecordingV2[], userId: string) {
  const now = new Date().toISOString();
  const rows = recordings.map((r) => {
    const d = toDetails(r);
    const participants = d.participants ?? [];
    return {
      id: d.id,
      title: d.title ?? null,
      url: d.url ?? null,
      start_datetime: d.start_datetime ?? null,
      end_datetime: d.end_datetime ?? null,
      public_thumbnail_url: d.public_thumbnail_url ?? null,
      owners: d.owners ?? [],
      tags: d.tags ?? [],
      participants,
      participants_text: participants
        .map((p) => [p.name, p.email].filter(Boolean).join(" "))
        .join(", "),
      intelligence_notes_md: d.intelligence_notes_md ?? null,
      user_id: userId,
      webhook_type: "backfill",
      raw_payload: { type: "backfill", user_id: userId, data: r },
      indexed_at: now,
      updated_at: now,
    };
  });
  const { error } = await supabase
    .from("grain_meeting_recordings")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

async function main() {
  const who = await fetch(`${GRAIN_BASE_URL}/token-info`, {
    headers: {
      Authorization: `Bearer ${GRAIN_TOKEN}`,
      "Public-Api-Version": GRAIN_API_VERSION,
    },
  }).then((r) => r.json() as Promise<{ user_id: string; name: string }>);
  console.log(`Backfilling as ${who.name}${since ? ` since ${since}` : ""}…`);

  let cursor: string | undefined;
  let total = 0;
  for (let page = 1; ; page++) {
    const { recordings, cursor: next } = await fetchPage(cursor);
    if (recordings.length === 0) break;
    await upsertBatch(recordings, who.user_id);
    total += recordings.length;
    console.log(
      `Page ${page}: ${recordings.length} [${recordings.at(-1)?.start_datetime} → ${recordings[0]?.start_datetime}]`,
    );
    if (!next) break;
    cursor = next;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`Done. Indexed ${total} recordings.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
