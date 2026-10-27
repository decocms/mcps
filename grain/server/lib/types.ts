/**
 * Grain Public API v2 types
 * @see https://developers.grain.com/endpoints.html
 */

// -- v2 wire shapes --

export interface RecordingParticipant {
  id?: string;
  email: string | null;
  name: string | null;
  scope: string;
  confirmed_attendee?: boolean;
  observed_join_time?: string | null;
  observed_leave_time?: string | null;
}

export interface RecordingHighlight {
  id: string;
  recording_id: string;
  text: string;
  transcript: string;
  timestamp: number;
  duration: number;
  created_datetime: string;
  url: string;
  thumbnail_url: string;
}

/** A Recording as v2 returns it (fields beyond `include` may be absent). */
export interface GrainRecordingV2 {
  id: string;
  title: string;
  url: string;
  start_datetime: string;
  end_datetime: string;
  duration_ms?: number;
  thumbnail_url: string | null;
  source?: string;
  media_type?: string;
  tags?: string[];
  recorders?: { id: string; name: string; email: string | null }[];
  participants?: RecordingParticipant[];
  highlights?: RecordingHighlight[];
  ai_summary?: { text: string } | null;
  ai_template_sections?: { title: string; data: unknown }[];
  [key: string]: unknown;
}

export interface RecordingsInclude {
  participants?: boolean;
  highlights?: boolean;
  ai_summary?: boolean;
  ai_template_sections?: { format?: "json" | "markdown" | "text" };
}

export interface ListRecordingsParams {
  cursor?: string;
  start_date?: string;
  end_date?: string;
  title?: string;
  attendance?: "hosted" | "attended";
  include_highlights?: boolean;
  include_participants?: boolean;
}

export interface ListRecordingsResponse {
  cursor: string | null;
  recordings: GrainRecordingV2[];
}

// -- The shape this MCP exposes (stable across the v1 → v2 move) --

export interface Recording {
  id: string;
  title: string;
  url: string;
  start_datetime: string;
  end_datetime: string;
  public_thumbnail_url: string | null;
}

export interface RecordingDetails extends Recording {
  participants?: RecordingParticipant[];
  /** Recorder emails (v1 called them owners). */
  owners?: string[];
  tags?: string[];
  highlights?: RecordingHighlight[];
  transcript_json?: TranscriptEntry[];
  /** v2's AI summary, in markdown (v1 called it intelligence notes). */
  intelligence_notes_md?: string;
  intelligence_notes_json?: IntelligenceNoteSection[];
}

export interface TranscriptEntry {
  speaker: string;
  text: string;
  start_time?: number;
  end_time?: number;
}

export interface IntelligenceNoteSection {
  title: string;
  body: string;
}

/** v2 Recording → the MCP's stable shape. Extra v2 fields pass through. */
export function toDetails(r: GrainRecordingV2): RecordingDetails {
  const owners = (r.recorders ?? [])
    .map((x) => x.email)
    .filter((e): e is string => Boolean(e));
  return {
    ...r,
    id: r.id,
    title: r.title,
    url: r.url,
    start_datetime: r.start_datetime,
    end_datetime: r.end_datetime,
    public_thumbnail_url: r.thumbnail_url ?? null,
    owners,
    tags: r.tags ?? [],
    participants: r.participants,
    highlights: r.highlights,
    intelligence_notes_md: r.ai_summary?.text ?? undefined,
    intelligence_notes_json: r.ai_template_sections?.map((s) => ({
      title: s.title,
      body: typeof s.data === "string" ? s.data : JSON.stringify(s.data),
    })),
  };
}
