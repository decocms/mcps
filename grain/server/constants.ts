/**
 * Grain Public API v2 constants.
 * v1 (`/_/public-api/...` without `/v2`) was retired — it answers 410 Gone.
 * @see https://developers.grain.com/endpoints.html
 */
export const GRAIN_BASE_URL = "https://api.grain.com/_/public-api/v2";
export const GRAIN_API_VERSION = "2026-10-01";

export const GRAIN_RECORDINGS_ENDPOINT = "/recordings";
export const GRAIN_HOOKS_ENDPOINT = "/hooks";

/** Hook types the index listens to. */
export const INDEXED_HOOK_TYPES = [
  "recording_added",
  "recording_updated",
] as const;

/** What every indexed recording is fetched with. */
export const INDEX_INCLUDE = { participants: true, ai_summary: true } as const;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
