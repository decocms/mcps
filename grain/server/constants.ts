/**
 * API Documentation: https://developers.grain.com/
 */
export const GRAIN_BASE_URL = "https://api.grain.com";
export const GRAIN_LIST_RECORDINGS_ENDPOINT = "/_/public-api/recordings";
export const GRAIN_RECORDING_ENDPOINT = "/_/public-api/recordings";
export const GRAIN_TRANSCRIPT_ENDPOINT =
  "/_/public-api/recordings/:id/transcript";

// Webhook endpoints (API v2)
export const GRAIN_CREATE_WEBHOOK_ENDPOINT = "/_/public-api/v2/hooks/create";
export const GRAIN_LIST_WEBHOOKS_ENDPOINT = "/_/public-api/v2/hooks";
export const GRAIN_DELETE_WEBHOOK_ENDPOINT = "/_/public-api/v2/hooks";

export const GRAIN_API_VERSION = "2025-10-31";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
