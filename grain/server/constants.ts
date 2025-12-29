/**
 * Grain API constants and configuration
 * Grain is an AI meeting recorder and note-taking platform
 */

export const GRAIN_BASE_URL = "https://api.grain.com";

// API Endpoints (v2)
export const GRAIN_RECORDINGS_ENDPOINT = "/_/public-api/v2/recordings";
export const GRAIN_TRANSCRIPT_ENDPOINT = "/_/public-api/v2/transcripts";
export const GRAIN_SEARCH_ENDPOINT = "/_/public-api/v2/search";
export const GRAIN_HIGHLIGHTS_ENDPOINT = "/_/public-api/v2/highlights";
export const GRAIN_HOOKS_CREATE_ENDPOINT = "/_/public-api/v2/hooks/create";
export const GRAIN_OAUTH_TOKEN_ENDPOINT = "/_/public-api/oauth2/token";

// Default pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Default limits
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_RESULTS = 50;

// Recording status
export const RECORDING_STATUS = {
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
} as const;

// Meeting platforms
export const MEETING_PLATFORMS = {
  ZOOM: "zoom",
  GOOGLE_MEET: "meet",
  MICROSOFT_TEAMS: "teams",
  WEBEX: "webex",
  OTHER: "other",
} as const;

// Sort options
export const SORT_OPTIONS = [
  "recorded_at",
  "created_at",
  "duration",
  "title",
] as const;

// Sort orders
export const SORT_ORDERS = ["asc", "desc"] as const;
