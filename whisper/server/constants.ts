// OpenAI Whisper API configuration
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT = "/audio/transcriptions";

// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = [
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
] as const;

// Maximum file size (25 MB)
export const MAX_AUDIO_FILE_SIZE_MB = 25;
