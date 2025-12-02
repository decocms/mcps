/**
 * Speech-to-Text Helper Function
 * Provides speech-to-text conversion using Google Cloud Speech-to-Text API
 */
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import { DEFAULT_LANGUAGE } from "../constants.ts";

/**
 * Convert audio to text using Google Cloud API
 */
export async function speechToText(
  env: Env,
  audioUrl: string,
  languageCode?: string,
  model?: string,
  enableAutomaticPunctuation?: boolean,
  enableWordTimeOffsets?: boolean,
) {
  try {
    console.log(
      `[speech_to_text] Transcribing audio from: ${audioUrl.substring(0, 100)}...`,
    );

    const client = createGoogleSpeechClient(env);

    const response = await client.recognizeSpeech(
      audioUrl,
      languageCode || DEFAULT_LANGUAGE,
      model || "default",
      enableAutomaticPunctuation !== false,
      enableWordTimeOffsets || false,
    );

    // Extract the best transcript
    let transcript = "";
    let confidence = 0;
    let words: Array<{
      word: string;
      startTime: string;
      endTime: string;
      confidence: number;
    }> = [];

    if (response.results && response.results.length > 0) {
      const bestResult = response.results[response.results.length - 1];
      if (bestResult.alternatives && bestResult.alternatives.length > 0) {
        const bestAlternative = bestResult.alternatives[0];
        transcript = bestAlternative.transcript;
        confidence = bestAlternative.confidence;
        words = bestAlternative.words || [];
      }
    }

    console.log(
      `[speech_to_text] Successfully transcribed audio. Confidence: ${confidence}`,
    );

    const result: Record<string, unknown> = {
      success: true,
      transcript,
      confidence,
      message: "Áudio transcrito com sucesso",
    };

    if (enableWordTimeOffsets && words.length > 0) {
      result.words = words;
    }

    if (response.totalBilledTime) {
      result.billedDuration = response.totalBilledTime;
    }

    return result;
  } catch (error) {
    console.error("[speech_to_text] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage,
      message: `Erro ao transcrever áudio: ${errorMessage}`,
    };
  }
}
