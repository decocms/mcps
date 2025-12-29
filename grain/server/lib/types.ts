/**
 * Type definitions for Grain API
 */

export interface Recording {
  id: string;
  title: string;
  owners: string[]; // Email addresses of recording owners
  source: string; // e.g., "zoom", "meet", "teams"
  url: string; // Public share URL
  tags: string[];
  summary: string;
  start_datetime: string; // ISO 8601 timestamp
  end_datetime: string; // ISO 8601 timestamp
  public_thumbnail_url: string | null;
  duration_ms: number; // Duration in milliseconds
  hubspot_company_ids: string[];
  hubspot_deal_ids: string[];
  summary_points: SummaryPoint[];
  public_url: string;
  transcript_json_url: string;
  transcript_srt_url: string;
  transcript_txt_url: string;
  transcript_vtt_url: string;
  intelligence_notes_md: string; // Markdown-formatted notes
}

export interface SummaryPoint {
  timestamp: number; // Milliseconds from start
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
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  status?: string;
  search?: string;
}

export interface ListRecordingsResponse {
  cursor?: string; // Cursor for pagination
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
