export interface Recording {
  id: string;
  title: string;
  owners: string[];
  source: string;
  url: string;
  tags: string[];
  summary: string;
  start_datetime: string;
  end_datetime: string;
  public_thumbnail_url: string | null;
  duration_ms: number;
  hubspot_company_ids: string[];
  hubspot_deal_ids: string[];
  summary_points: SummaryPoint[];
  public_url: string;
  transcript_json_url: string;
  transcript_srt_url: string;
  transcript_txt_url: string;
  transcript_vtt_url: string;
  intelligence_notes_md: string;
}

export interface SummaryPoint {
  timestamp: number;
  text: string;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface ListRecordingsParams {
  limit?: number;
  offset?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
  search?: string;
}

export interface ListRecordingsResponse {
  cursor?: string;
  recordings: Recording[];
}

export interface RecordingDetails extends Recording {
  transcript_segments?: TranscriptSegment[];
  highlights?: Highlight[];
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

export interface Highlight {
  id: string;
  text: string;
  timestamp: number;
  created_by?: string;
}

/**
 * Webhook types
 * API v2: https://developers.grain.com/
 */
export interface RecordingFilter {
  before_datetime?: string;
  after_datetime?: string;
  attendance?: "hosted" | "attended";
  participant_scope?: "internal" | "external";
  title_search?: string;
  team?: string;
  meeting_type?: string;
}

/**
 * Recording include options
 * Specifies what data to include in webhook payload
 */
export interface RecordingInclude {
  highlights?: boolean;
  participants?: boolean;
  ai_summary?: boolean;
  private_notes?: boolean;
  calendar_event?: boolean;
  hubspot?: boolean;
  ai_template_sections?: {
    format?: "json" | "markdown" | "text";
    allowed_sections?: string[];
  };
}

export interface WebhookConfig {
  hook_url: string;
  filter?: RecordingFilter;
  include?: RecordingInclude;
}

export interface Webhook {
  id: string;
  hook_url: string;
  enabled: boolean;
  filter?: RecordingFilter;
  include?: RecordingInclude;
  inserted_at: string;
}

export interface CreateWebhookResponse {
  id: string;
  hook_url: string;
  enabled: boolean;
  filter: RecordingFilter;
  include: RecordingInclude;
  inserted_at: string;
}

export interface ListWebhooksResponse {
  hooks: Webhook[];
}

/**
 * Webhook payload sent by Grain when an event occurs
 * Based on the Hook Payload Example from Grain docs
 */
export interface WebhookPayload {
  type: "recording_added"; // Event type
  user_id: string; // UUID of user
  data: WebhookRecordingData;
}

/**
 * Recording data included in webhook payload
 */
export interface WebhookRecordingData {
  id: string;
  title: string;
  source: string;
  url: string;
  media_type: string;
  tags: string[];
  start_datetime: string;
  end_datetime: string;
  duration_ms: number;
  thumbnail_url?: string;
  teams?: Array<{
    id: string;
    name: string;
  }>;
  meeting_type?: {
    id: string;
    name: string;
    scope: string;
  };
  // Additional fields based on include options
  highlights?: unknown[];
  participants?: unknown[];
  ai_summary?: string;
  calendar_event?: unknown;
  hubspot?: unknown;
  ai_template_sections?: unknown;
}
