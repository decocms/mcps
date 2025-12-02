/**
 * Speech-to-Text Tool
 * Converts audio to text using Google Cloud Speech-to-Text API
 */
import { z } from "zod";
import { createTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { createGoogleSpeechClient } from "../lib/google-speech-client.ts";
import { DEFAULT_LANGUAGE, SUPPORTED_SPEECH_MODELS } from "../constants.ts";

/**
 * Create the speech-to-text tool
 */
export const createSpeechToTextTool = (env: Env) =>
  createTool({
    id: "SPEECH_TO_TEXT",
    description:
      "Converte áudio em texto usando Google Cloud Speech-to-Text. Suporta múltiplos formatos de áudio e idiomas. Retorna a transcrição com nível de confiança.",
    inputSchema: z.object({
      audioUrl: z
        .string()
        .url("URL do áudio deve ser uma URL válida")
        .describe("URL do arquivo de áudio para transcrever"),
      languageCode: z
        .string()
        .optional()
        .describe(
          `Código do idioma esperado (ex: pt-BR, en-US). Padrão: ${DEFAULT_LANGUAGE}`,
        ),
      model: z
        .enum(SUPPORTED_SPEECH_MODELS)
        .optional()
        .describe(
          "Modelo de reconhecimento (default, command_and_search, phone_call, video, medical_conversation, medical_dictation). Padrão: default",
        ),
      enableAutomaticPunctuation: z
        .boolean()
        .optional()
        .describe("Adicionar pontuação automaticamente. Padrão: true"),
      enableWordTimeOffsets: z
        .boolean()
        .optional()
        .describe(
          "Incluir marcadores de tempo para cada palavra. Padrão: false",
        ),
    }),

    execute: async ({ context }) => {
      try {
        console.log(
          `[speech_to_text] Transcribing audio from: ${context.audioUrl.substring(0, 100)}...`,
        );

        const client = createGoogleSpeechClient(env);

        const response = await client.recognizeSpeech(
          context.audioUrl,
          context.languageCode || DEFAULT_LANGUAGE,
          context.model || "default",
          context.enableAutomaticPunctuation !== false,
          context.enableWordTimeOffsets || false,
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

        if (context.enableWordTimeOffsets && words.length > 0) {
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
