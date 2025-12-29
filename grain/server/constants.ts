/**
 * Grain API constants and configuration
 * API Documentation: https://developers.grain.com/
 *
 * IMPORTANT: Grain API uses GET with query parameters!
 * Correct endpoint: /_/public-api/recordings (ONE underscore, no /v2)
 */

export const GRAIN_BASE_URL = "https://api.grain.com";
export const GRAIN_LIST_RECORDINGS_ENDPOINT = "/_/public-api/recordings"; // GET method!
export const GRAIN_RECORDING_ENDPOINT = "/_/public-api/recordings"; // GET method
export const GRAIN_TRANSCRIPT_ENDPOINT =
  "/_/public-api/recordings/:id/transcript";

// Default pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
