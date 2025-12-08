/**
 * Text-to-Speech Private Tool
 * Provides text-to-speech conversion using Google Cloud Text-to-Speech API
 */
import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import { DEFAULT_LANGUAGE, DEFAULT_VOICE_NAME } from "../constants.ts";

// Input schema for text-to-speech
const TextToSpeechInputSchema = z.object({
  text: z.string().describe("Text to convert to speech (max 5000 characters)"),
  languageCode: z
    .string()
    .optional()
    .describe("Language code (e.g., pt-BR, en-US, es-ES)"),
  voiceName: z
    .string()
    .optional()
    .describe("Voice name (e.g., pt-BR-Standard-A, pt-BR-Neural2-A)"),
  audioEncoding: z
    .enum(["LINEAR16", "MP3", "OGG_OPUS", "MULAW"])
    .optional()
    .describe("Audio encoding format"),
  speakingRate: z.number().optional().describe("Speaking rate (0.25 to 4.0)"),
  pitch: z.number().optional().describe("Pitch adjustment (-20.0 to 20.0)"),
});

// Output schema for text-to-speech
const TextToSpeechOutputSchema = z.object({
  success: z.boolean(),
  audioContent: z.string().optional().describe("Base64 encoded audio"),
  audioConfig: z
    .object({
      audioEncoding: z.string(),
      sampleRateHertz: z.number().optional(),
      effectiveChannel: z.number().optional(),
    })
    .optional(),
  contentLength: z.number().optional(),
  message: z.string(),
  error: z.string().optional(),
});

/**
 * Create the text-to-speech private tool
 */
export const createTextToSpeechTool = (env: Env) =>
  createTool({
    id: "text_to_speech",
    description: "Convert text to speech using Google Cloud Text-to-Speech API",
    inputSchema: TextToSpeechInputSchema,
    outputSchema: TextToSpeechOutputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof TextToSpeechInputSchema>;
    }): Promise<z.infer<typeof TextToSpeechOutputSchema>> => {
      try {
        const {
          text,
          languageCode = DEFAULT_LANGUAGE,
          voiceName = DEFAULT_VOICE_NAME,
          audioEncoding = "MP3",
          speakingRate = 1.0,
          pitch = 0.0,
        } = context;

        console.log("context", context);
        console.log("env", env);

        console.log(
          `[text_to_speech] Converting text to speech: ${text.substring(0, 100)}...`,
        );

        const client = createGoogleSpeechClient(env);

        const response = await client.synthesizeSpeech(
          text,
          languageCode,
          voiceName,
          audioEncoding,
          speakingRate,
          pitch,
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: errorMessage,
          message: `Erro ao converter texto para fala: ${errorMessage}`,
        };
      }
    },
  });
