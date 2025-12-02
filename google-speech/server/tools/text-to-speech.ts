/**
 * Text-to-Speech Tool
 * Converts text to speech audio using Google Cloud Text-to-Speech API
 */
import { z } from "zod";
import { createTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_VOICE_NAME,
  SUPPORTED_AUDIO_ENCODINGS,
} from "../constants.ts";

/**
 * Create the text-to-speech tool
 */
export const createTextToSpeechTool = (env: Env) =>
  createTool({
    id: "text_to_speech",
    description:
      "Converte texto em áudio usando Google Cloud Text-to-Speech. Retorna áudio em base64 que pode ser salvo como arquivo MP3 ou outro formato especificado.",
    inputSchema: z.object({
      text: z
        .string()
        .min(1, "Texto não pode estar vazio")
        .max(5000, "Texto não pode exceder 5000 caracteres")
        .describe("Texto a ser convertido em fala"),
      languageCode: z
        .string()
        .optional()
        .describe(
          `Código do idioma (ex: pt-BR, en-US, es-ES). Padrão: ${DEFAULT_LANGUAGE}`,
        ),
      voiceName: z
        .string()
        .optional()
        .describe(
          `Nome da voz (ex: pt-BR-Standard-A, pt-BR-Neural2-A). Padrão: ${DEFAULT_VOICE_NAME}`,
        ),
      audioEncoding: z
        .enum(SUPPORTED_AUDIO_ENCODINGS)
        .optional()
        .describe(
          "Formato de áudio (MP3, LINEAR16, OGG_OPUS, MULAW). Padrão: MP3",
        ),
      speakingRate: z
        .number()
        .min(0.25)
        .max(4.0)
        .optional()
        .describe("Velocidade de fala (0.25 a 4.0). Padrão: 1.0"),
      pitch: z
        .number()
        .min(-20.0)
        .max(20.0)
        .optional()
        .describe("Tom da voz (-20.0 a 20.0 semitons). Padrão: 0.0"),
    }),

    execute: async ({ context }) => {
      try {
        console.log(
          `[text_to_speech] Converting text to speech: ${context.text.substring(0, 100)}...`,
        );

        const client = createGoogleSpeechClient(env);

        const response = await client.synthesizeSpeech(
          context.text,
          context.languageCode || DEFAULT_LANGUAGE,
          context.voiceName || DEFAULT_VOICE_NAME,
          context.audioEncoding || "MP3",
          context.speakingRate || 1.0,
          context.pitch || 0.0,
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
