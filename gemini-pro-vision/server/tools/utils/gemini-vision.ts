import { GEMINI_BASE_URL, DEFAULT_MODEL } from "../../constants";
import { Env } from "../../main";
import z from "zod";
import {
  assertEnvKey,
  makeApiRequest,
} from "@decocms/mcps-shared/tools/utils/api-client";

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
 * Makes a request to the Gemini Vision API
 */
async function makeGeminiRequest(
  env: Env,
  endpoint: string,
  body: any,
): Promise<GeminiVisionResponse> {
  assertEnvKey(env, "GOOGLE_GENAI_API_KEY");

  const url = `${GEMINI_BASE_URL}${endpoint}?key=${env.GOOGLE_GENAI_API_KEY}`;

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
 * Analyzes an image using Gemini Pro Vision
 * @param env Environment with variables
 * @param imageUrl URL of the image to analyze
 * @param prompt Prompt to guide the analysis
 * @param model Model to use (default: gemini-2.5-flash)
 */
export async function analyzeImage(
  env: Env,
  imageUrl: string,
  prompt: string,
  model: string = DEFAULT_MODEL,
): Promise<GeminiVisionResponse> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");

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

export async function compareImages(
  env: Env,
  imageUrls: string[],
  prompt: string,
  model: string = DEFAULT_MODEL,
): Promise<GeminiVisionResponse> {
  const imageParts = await Promise.all(
    imageUrls.map(async (url) => {
      const imageResponse = await fetch(url);
      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download image: ${imageResponse.statusText}`,
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString("base64");

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

export const createGeminiVisionClient = (env: Env) => ({
  analyzeImage: (imageUrl: string, prompt: string, model?: string) =>
    analyzeImage(env, imageUrl, prompt, model),
  compareImages: (imageUrls: string[], prompt: string, model?: string) =>
    compareImages(env, imageUrls, prompt, model),
});
