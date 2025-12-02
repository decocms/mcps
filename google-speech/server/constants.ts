/**
 * Constants for Google Cloud Speech APIs
 */

// API Base URLs
export const TEXT_TO_SPEECH_BASE_URL = "https://texttospeech.googleapis.com/v1";
export const SPEECH_TO_TEXT_BASE_URL = "https://speech.googleapis.com/v1";

// Default configuration
export const DEFAULT_LANGUAGE = "pt-BR";
export const DEFAULT_VOICE_NAME = "pt-BR-Standard-A";
export const DEFAULT_AUDIO_ENCODING = "MP3";
export const DEFAULT_SPEAKING_RATE = 1.0;
export const DEFAULT_PITCH = 0.0;

// Supported audio encodings for Text-to-Speech
export const SUPPORTED_AUDIO_ENCODINGS = [
  "LINEAR16",
  "MP3",
  "OGG_OPUS",
  "MULAW",
] as const;

// Supported models for Speech-to-Text
export const SUPPORTED_SPEECH_MODELS = [
  "default",
  "command_and_search",
  "phone_call",
  "video",
  "medical_conversation",
  "medical_dictation",
] as const;

// Language codes mapping
export const LANGUAGE_CODES = {
  "pt-BR": "Português (Brasil)",
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "es-ES": "Español (España)",
  "es-MX": "Español (México)",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "it-IT": "Italiano",
  "ja-JP": "日本語",
  "zh-CN": "中文 (简体)",
  "zh-TW": "中文 (繁體)",
  "ko-KR": "한국어",
  "ru-RU": "Русский",
  "ar-SA": "العربية",
  "hi-IN": "हिन्दी",
} as const;

// Available voices for Portuguese (Brazil) - example for common languages
export const VOICES_BY_LANGUAGE: Record<string, string[]> = {
  "pt-BR": [
    "pt-BR-Standard-A",
    "pt-BR-Standard-B",
    "pt-BR-Standard-C",
    "pt-BR-Neural2-A",
    "pt-BR-Neural2-B",
    "pt-BR-Neural2-C",
  ],
  "en-US": [
    "en-US-Neural2-A",
    "en-US-Neural2-C",
    "en-US-Neural2-E",
    "en-US-Neural2-F",
  ],
};
