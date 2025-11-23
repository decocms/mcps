import { GEMINI_BASE_URL, DEFAULT_MODEL } from "../../constants";
import { Env } from "../../main";
import z from "zod";
import {
  assertEnvKey,
  makeApiRequest,
} from "@decocms/mcps-shared/tools/utils/api-client";

// Schema da resposta do Gemini Vision API
export const GeminiVisionResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(
          z.object({
            text: z.string().optional(),
          }),
        ),
        role: z.string().optional(),
      }),
      finishReason: z.string().optional(),
      index: z.number().optional(),
      safetyRatings: z
        .array(
          z.object({
            category: z.string(),
            probability: z.string(),
            blocked: z.boolean().optional(),
          }),
        )
        .optional(),
    }),
  ),
  promptFeedback: z
    .object({
      safetyRatings: z
        .array(
          z.object({
            category: z.string(),
            probability: z.string(),
            blocked: z.boolean().optional(),
          }),
        )
        .optional(),
      blockReason: z.string().optional(),
    })
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional(),
});

export type GeminiVisionResponse = z.infer<typeof GeminiVisionResponseSchema>;

/**
 * Faz uma requisição ao Gemini Vision API
 */
async function makeGeminiRequest(
  env: Env,
  endpoint: string,
  body: any,
): Promise<GeminiVisionResponse> {
  assertEnvKey(env, "GEMINI_API_KEY");

  const url = `${GEMINI_BASE_URL}${endpoint}?key=${env.GEMINI_API_KEY}`;

  const data = await makeApiRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    "Gemini Vision API",
  );

  return GeminiVisionResponseSchema.parse(data);
}

/**
 * Analisa uma imagem usando o Gemini Pro Vision
 * @param env Ambiente com variáveis
 * @param imageUrl URL da imagem para analisar
 * @param prompt Prompt para guiar a análise
 * @param model Modelo a ser usado (padrão: gemini-1.5-pro-vision-latest)
 */
export async function analyzeImage(
  env: Env,
  imageUrl: string,
  prompt: string,
  model: string = DEFAULT_MODEL,
): Promise<GeminiVisionResponse> {
  // Baixar a imagem e converter para base64
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Falha ao baixar imagem: ${imageResponse.statusText}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

  // Determinar o mime type
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inline_data: {
              mime_type: contentType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096,
    },
  };

  return makeGeminiRequest(env, `${model}:generateContent`, body);
}

/**
 * Compara múltiplas imagens usando o Gemini Pro Vision
 */
export async function compareImages(
  env: Env,
  imageUrls: string[],
  prompt: string,
  model: string = DEFAULT_MODEL,
): Promise<GeminiVisionResponse> {
  // Baixar e converter todas as imagens
  const imageParts = await Promise.all(
    imageUrls.map(async (url) => {
      const imageResponse = await fetch(url);
      if (!imageResponse.ok) {
        throw new Error(`Falha ao baixar imagem: ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = btoa(
        String.fromCharCode(...new Uint8Array(imageBuffer)),
      );

      const contentType =
        imageResponse.headers.get("content-type") || "image/jpeg";

      return {
        inline_data: {
          mime_type: contentType,
          data: base64Image,
        },
      };
    }),
  );

  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          ...imageParts,
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096,
    },
  };

  return makeGeminiRequest(env, `${model}:generateContent`, body);
}

/**
 * Cria um cliente do Gemini Vision
 */
export const createGeminiVisionClient = (env: Env) => ({
  analyzeImage: (imageUrl: string, prompt: string, model?: string) =>
    analyzeImage(env, imageUrl, prompt, model),
  compareImages: (imageUrls: string[], prompt: string, model?: string) =>
    compareImages(env, imageUrls, prompt, model),
});
