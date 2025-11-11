// OpenAI Sora API configuration
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_VIDEOS_ENDPOINT = "/videos";

// Video generation configuration
export const OPERATION_POLL_INTERVAL_MS = 10000; // 10 seconds
export const OPERATION_MAX_WAIT_MS = 600000; // 10 minutes for Sora (longer than Veo)
