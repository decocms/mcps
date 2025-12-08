/**
 * Speech-to-Text Private Tool
 * Provides speech-to-text conversion using Google Cloud Speech-to-Text API
 */
import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import { DEFAULT_LANGUAGE } from "../constants.ts";

// Input schema for speech-to-text
const SpeechToTextInputSchema = z.object({
  audioUrl: z.string().describe("URL of the audio file to transcribe"),
  languageCode: z
    .string()
    .optional()
    .describe("Language code (e.g., pt-BR, en-US, es-ES)"),
  model: z
    .enum([
      "default",
      "command_and_search",
      "phone_call",
      "video",
      "medical_conversation",
      "medical_dictation",
    ])
    .optional()
    .describe("Speech recognition model"),
  enableAutomaticPunctuation: z
    .boolean()
    .optional()
    .describe("Enable automatic punctuation"),
  enableWordTimeOffsets: z
    .boolean()
    .optional()
    .describe("Include word-level timestamps"),
});

// Output schema for speech-to-text
const SpeechToTextOutputSchema = z.object({
  success: z.boolean(),
  transcript: z.string().optional().describe("Transcribed text"),
  confidence: z.number().optional().describe("Confidence score (0-1)"),
  words: z
    .array(
      z.object({
        word: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        confidence: z.number(),
      }),
    )
    .optional()
    .describe("Word-level timestamps"),
  billedDuration: z.string().optional().describe("Billed duration"),
  message: z.string(),
  error: z.string().optional(),
});

/**
 * Create the speech-to-text private tool
 */
export const createSpeechToTextTool = (env: Env) =>
  createTool({
    id: "speech_to_text",
    description: "Convert audio to text using Google Cloud Speech-to-Text API",
    inputSchema: SpeechToTextInputSchema,
    outputSchema: SpeechToTextOutputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof SpeechToTextInputSchema>;
    }): Promise<z.infer<typeof SpeechToTextOutputSchema>> => {
      try {
        const {
          audioUrl,
          languageCode = DEFAULT_LANGUAGE,
          model = "default",
          enableAutomaticPunctuation = true,
          enableWordTimeOffsets = false,
        } = context;

        console.log(
          `[speech_to_text] Transcribing audio from: ${audioUrl.substring(0, 100)}...`,
        );

        const client = createGoogleSpeechClient(env);

        const response = await client.recognizeSpeech(
          audioUrl,
          languageCode,
          model,
          enableAutomaticPunctuation,
          enableWordTimeOffsets,
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

        const result: z.infer<typeof SpeechToTextOutputSchema> = {
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: errorMessage,
          message: `Erro ao transcrever áudio: ${errorMessage}`,
        };
      }
    },
  });
