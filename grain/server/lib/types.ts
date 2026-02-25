import { z } from "zod";

/**
 * Grain Public API types
 * @see https://grainhq.notion.site/Grain-Personal-API
 */

// -- Recordings (list) --

export interface Recording {
  id: string;
  title: string;
  url: string;
  start_datetime: string;
  end_datetime: string;
  public_thumbnail_url: string | null;
}

export interface ListRecordingsParams {
  cursor?: string;
  start_date?: string;
  end_date?: string;
  title?: string;
  attendance?: "hosted" | "attended";
  include_highlights?: boolean;
  include_participants?: boolean;
  include_calendar_id?: boolean;
}

export interface ListRecordingsResponse {
  cursor: string | null;
  recordings: Recording[];
}

// -- Recording details (single) --

export interface RecordingParticipant {
  email: string;
  name: string;
  scope: string;
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

export interface RecordingDetails extends Recording {
  participants?: RecordingParticipant[];
  owners?: string[];
  tags?: string[];
  highlights?: RecordingHighlight[];
  transcript_json?: TranscriptEntry[];
  transcript_vtt?: string;
  intelligence_notes_md?: string;
  intelligence_notes_json?: IntelligenceNoteSection[];
  intelligence_notes_text?: string;
}

export interface TranscriptEntry {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

export interface IntelligenceNoteSection {
  title: string;
  body: string;
}

// -- Views --

export interface GrainView {
  id: string;
  name: string;
}

export interface ListViewsResponse {
  views: GrainView[];
  cursor?: string;
}

// -- Hooks (REST Hooks) --

export type HookAction = "added" | "updated" | "removed";

export interface CreateHookParams {
  version: 2;
  hook_url: string;
  view_id: string;
  actions?: HookAction[];
}

export interface Hook {
  id: string;
  hook_url: string;
  view_id: string;
  inserted_at: string;
}

export interface CreateHookResponse extends Hook {}

export interface ListHooksResponse {
  hooks: Hook[];
}

// -- Webhook payloads (inbound from Grain) --

export type WebhookEventType =
  | "recording_added"
  | "recording_updated"
  | "recording_removed"
  | "highlight_added"
  | "highlight_updated"
  | "highlight_removed"
  | "story_added"
  | "story_updated"
  | "story_removed";

export interface WebhookRecordingData {
  id: string;
  title?: string;
  url?: string;
  start_datetime?: string;
  end_datetime?: string;
  public_thumbnail_url?: string | null;
}

export interface WebhookPayload {
  type: WebhookEventType;
  user_id: string;
  data: WebhookRecordingData;
}

export const WebhookPayloadSchema = z.object({
  type: z.enum([
    "recording_added",
    "recording_updated",
    "recording_removed",
    "highlight_added",
    "highlight_updated",
    "highlight_removed",
    "story_added",
    "story_updated",
    "story_removed",
  ]),
  user_id: z.string(),
  data: z.object({
    id: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    start_datetime: z.string().optional(),
    end_datetime: z.string().optional(),
    public_thumbnail_url: z.string().nullable().optional(),
  }),
});
