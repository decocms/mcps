import type { Env } from "../main.ts";
import { createGeminiVisionClient } from "./utils/gemini-vision.ts";
import {
  createImageAnalyzerTools,
  type Contract,
} from "@decocms/mcps-shared/image-analyzers";

type GeminiVisionClient = ReturnType<typeof createGeminiVisionClient>;

const geminiVisionToolsFactory = createImageAnalyzerTools<
  Env,
  GeminiVisionClient
>({
  metadata: {
    provider: "Gemini Pro Vision",
    description:
      "Analyzes images using Gemini Pro Vision. Can describe content, identify objects, read text (OCR), answer questions about images.",
  },
  getClient: (env) => createGeminiVisionClient(env),

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
        throw new Error("No response from Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("No text returned in the analysis");
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
        throw new Error("No response from Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("No text returned in the comparison");
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
      const prompt = `Extract all visible text in this image. Keep the original formatting and structure as much as possible.${languageHint} Return only the text, without additional comments.`;

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
        throw new Error("No response from Gemini Vision API");
      }

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      if (!textParts) {
        throw new Error("No text found in the image");
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
        clauseId: "gemini-pro-vision:extractTextFromImage",
        amount: 1,
      },
    }),
  },
});

export const geminiVisionTools = {
  analyzeImage: geminiVisionToolsFactory.analyzeImage,
  compareImages: geminiVisionToolsFactory.compareImages!,
  extractTextFromImage: geminiVisionToolsFactory.extractTextFromImage!,
};
