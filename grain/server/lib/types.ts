/**
 * Type definitions for Grain API
 * Grain is an AI-powered meeting recorder and note-taking tool
 */

/**
 * Recording - A recorded meeting
 */
export interface Recording {
  id: string;
  title: string;
  meeting_url?: string;
  meeting_platform?: "zoom" | "meet" | "teams" | "webex" | "other";
  duration_seconds: number;
  recorded_at: string;
  status: "processing" | "ready" | "failed";
  participants: Participant[];
  transcript_available: boolean;
  video_url?: string;
  audio_url?: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    meeting_type?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Participant in a recording
 */
export interface Participant {
  id?: string;
  name: string;
  email?: string;
  role?: string;
}

/**
 * Transcript - Full transcript of a recording
 */
export interface Transcript {
  id: string;
  recording_id: string;
  language: string;
  status: "processing" | "ready" | "failed";
  segments: TranscriptSegment[];
  created_at: string;
  updated_at: string;
}

/**
 * Segment of a transcript with speaker and timing
 */
export interface TranscriptSegment {
  id: string;
  speaker: string;
  speaker_id?: string;
  text: string;
  start_time: number; // seconds
  end_time: number; // seconds
  confidence?: number;
}

/**
 * Recording summary
 */
export interface RecordingSummary {
  id: string;
  title: string;
  duration_seconds: number;
  recorded_at: string;
  status: string;
  participants_count: number;
  transcript_available: boolean;
}

/**
 * Parameters for listing recordings
 */
export interface ListRecordingsParams {
  meeting_type?: string;
  meeting_platform?: string;
  tags?: string[];
  participant_email?: string;
  from_date?: string; // ISO date
  to_date?: string; // ISO date
  status?: "processing" | "ready" | "failed";
  sort_by?: "recorded_at" | "created_at" | "duration" | "title";
  sort_order?: "asc" | "desc";
  limit?: number;
  offset?: number; // Deprecated: use cursor instead
  cursor?: string; // For cursor-based pagination
}

/**
 * Search parameters for recordings
 */
export interface SearchRecordingsParams {
  query: string;
  meeting_type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Search result from recordings
 */
export interface RecordingSearchResult {
  recording_id: string;
  title: string;
  recorded_at: string;
  matches: TranscriptMatch[];
  relevance_score: number;
}

/**
 * Match in transcript search
 */
export interface TranscriptMatch {
  segment_id: string;
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
  highlight: string; // Text with matched words highlighted
}

/**
 * API Response wrapper
 */
export interface GrainAPIResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
    has_more?: boolean;
    cursor?: string; // For cursor-based pagination
  };
}

/**
 * API Error response
 */
export interface GrainAPIError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
