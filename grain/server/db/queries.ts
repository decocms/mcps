import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase-client.ts";
import type {
  WebhookPayload,
  RecordingDetails,
  RecordingParticipant,
} from "../lib/types.ts";

export interface GrainRecordingRow {
  id: string;
  title: string | null;
  url: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  public_thumbnail_url: string | null;
  owners: string[];
  tags: string[];
  participants: RecordingParticipant[];
  participants_text: string | null;
  intelligence_notes_md: string | null;
  user_id: string;
  webhook_type: string;
  raw_payload: WebhookPayload;
  indexed_at: string;
  updated_at: string;
}

function throwIfError(error: PostgrestError | null, action: string): void {
  if (error) {
    throw new Error(`Failed to ${action}: ${error.message}`);
  }
}

function buildParticipantsText(participants: RecordingParticipant[]): string {
  return participants
    .map((p) => [p.name, p.email].filter(Boolean).join(" "))
    .join(", ");
}

export interface EnrichedWebhookData {
  payload: WebhookPayload;
  details: RecordingDetails | null;
}

function toDbRow(data: EnrichedWebhookData): GrainRecordingRow {
  const { payload, details } = data;
  const participants = details?.participants ?? [];

  return {
    id: payload.data.id,
    title: details?.title ?? payload.data.title ?? null,
    url: details?.url ?? payload.data.url ?? null,
    start_datetime:
      details?.start_datetime ?? payload.data.start_datetime ?? null,
    end_datetime: details?.end_datetime ?? payload.data.end_datetime ?? null,
    public_thumbnail_url:
      details?.public_thumbnail_url ??
      payload.data.public_thumbnail_url ??
      null,
    owners: details?.owners ?? [],
    tags: details?.tags ?? [],
    participants,
    participants_text: buildParticipantsText(participants),
    intelligence_notes_md: details?.intelligence_notes_md ?? null,
    user_id: payload.user_id,
    webhook_type: payload.type,
    raw_payload: payload,
    indexed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function indexRecording(data: EnrichedWebhookData): Promise<void> {
  const client = getSupabaseClient();
  const row = toDbRow(data);

  const { error } = await client
    .from("grain_recordings")
    .upsert(row, { onConflict: "id" });

  throwIfError(error, "upsert indexed recording");
}

export interface IndexedRecordingsSearchFilters {
  query?: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
  tag?: string;
  limit: number;
}

export async function searchIndexedRecordings(
  filters: IndexedRecordingsSearchFilters,
): Promise<GrainRecordingRow[]> {
  const client = getSupabaseClient();
  let qb = client
    .from("grain_recordings")
    .select("*")
    .order("start_datetime", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    qb = qb.gte("start_datetime", filters.startDate);
  }
  if (filters.endDate) {
    qb = qb.lte("start_datetime", filters.endDate);
  }
  if (filters.tag) {
    qb = qb.contains("tags", [filters.tag]);
  }
  if (filters.owner) {
    qb = qb.contains("owners", [filters.owner]);
  }
  if (filters.query && filters.query.trim().length > 0) {
    const q = filters.query.trim();
    qb = qb.or(
      `title.ilike.%${q}%,participants_text.ilike.%${q}%,intelligence_notes_md.ilike.%${q}%`,
    );
  }

  const { data, error } = await qb;
  throwIfError(error, "search indexed recordings");
  return (data ?? []) as GrainRecordingRow[];
}
