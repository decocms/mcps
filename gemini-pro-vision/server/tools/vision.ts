import type { Env } from "../main.ts";
import { createGeminiVisionClient } from "./utils/gemini-vision.ts";
import {
  createImageAnalyzerTools,
  type Contract,
} from "@decocms/mcps-shared/image-analyzers";

// Tipo do cliente Gemini Vision
type GeminiVisionClient = ReturnType<typeof createGeminiVisionClient>;

/**
 * Gemini Vision tools usando a factory compartilhada
 */
const geminiVisionToolsFactory = createImageAnalyzerTools<
  Env,
  GeminiVisionClient
>({
  metadata: {
    provider: "Gemini Pro Vision",
    description:
      "Analisa imagens usando o Gemini Pro Vision. Pode descrever conteúdo, identificar objetos, ler texto (OCR), responder perguntas sobre imagens.",
  },
  getClient: (env) =>
    createGeminiVisionClient({
      ...env,
      GEMINI_API_KEY: env.DECO_REQUEST_CONTEXT.state.GEMINI_API_KEY,
    } as Env),

  analyzeTool: {
    execute: async ({ input, client }) => {
      const response = await client.analyzeImage(
        input.imageUrl,
        input.prompt,
        input.model,
      );

      if (
        !response ||
        !response.candidates ||
        response.candidates.length === 0
      ) {
        throw new Error("Nenhuma resposta do Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("Nenhum texto retornado na análise");
      }

      return {
        analysis: textParts,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT as Contract,
      clause: {
        clauseId: "gemini-pro-vision:analyzeImage",
        amount: 1,
      },
    }),
  },

  compareTool: {
    execute: async ({ input, client }) => {
      const response = await client.compareImages(
        input.imageUrls,
        input.prompt,
        input.model,
      );

      if (
        !response ||
        !response.candidates ||
        response.candidates.length === 0
      ) {
        throw new Error("Nenhuma resposta do Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("Nenhum texto retornado na comparação");
      }

      return {
        comparison: textParts,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT as Contract,
      clause: {
        clauseId: "gemini-pro-vision:compareImages",
        amount: 1,
      },
    }),
  },

  extractTextTool: {
    execute: async ({ input, client }) => {
      const languageHint = input.language
        ? ` O texto está em ${input.language}.`
        : "";
      const prompt = `Extraia TODO o texto visível nesta imagem. Mantenha a formatação e estrutura original o máximo possível.${languageHint} Retorne apenas o texto, sem comentários adicionais.`;

      const response = await client.analyzeImage(
        input.imageUrl,
        prompt,
        input.model,
      );

      if (
        !response ||
        !response.candidates ||
        response.candidates.length === 0
      ) {
        throw new Error("Nenhuma resposta do Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("Nenhum texto encontrado na imagem");
      }

      return {
        text: textParts,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT as Contract,
      clause: {
        clauseId: "gemini-pro-vision:extractText",
        amount: 1,
      },
    }),
  },
});

/**
 * Exporta as tools como array para uso no index.ts
 */
export const createVisionTools = (env: Env) => [
  geminiVisionToolsFactory.analyzeImage(env),
  geminiVisionToolsFactory.compareImages!(env),
  geminiVisionToolsFactory.extractTextFromImage!(env),
];
