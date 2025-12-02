/**
 * Text-to-Speech Helper Function
 * Provides text-to-speech conversion using Google Cloud Text-to-Speech API
 */
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import { DEFAULT_LANGUAGE, DEFAULT_VOICE_NAME } from "../constants.ts";

/**
 * Convert text to speech using Google Cloud API
 */
export async function textToSpeech(
  env: Env,
  text: string,
  languageCode?: string,
  voiceName?: string,
  audioEncoding?: string,
  speakingRate?: number,
  pitch?: number,
) {
  try {
    console.log(
      `[text_to_speech] Converting text to speech: ${text.substring(0, 100)}...`,
    );

    const client = createGoogleSpeechClient(env);

    const response = await client.synthesizeSpeech(
      text,
      languageCode || DEFAULT_LANGUAGE,
      voiceName || DEFAULT_VOICE_NAME,
      audioEncoding || "MP3",
      speakingRate || 1.0,
      pitch || 0.0,
    );

    console.log("[text_to_speech] Successfully generated audio");

    return {
      success: true,
      audioContent: response.audioContent,
      audioConfig: response.audioConfig,
      contentLength: response.audioContent.length,
      message: "Áudio gerado com sucesso",
    };
  } catch (error) {
    console.error("[text_to_speech] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage,
      message: `Erro ao converter texto para fala: ${errorMessage}`,
    };
  }
}
