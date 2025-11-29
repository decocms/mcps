import { OPENROUTER_BASE_URL } from "../../constants";
import { Env } from "../../main";
import z from "zod";
import {
  assertEnvKey,
  makeApiRequest,
} from "@decocms/mcps-shared/tools/utils/api-client";

export const models = z.enum([
  "gemini-2.5-flash-image-preview",
  "gemini-3-pro-image-preview",
]);
export type Model = z.infer<typeof models>;

export const GeminiResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(
          z.object({
            text: z.string().optional(),
            inline_data: z
              .object({
                mime_type: z.string(),
                data: z.string(),
              })
              .optional(),
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

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      images?: Array<{
        image_url?: {
          url: string;
        };
      }>;
    };
    native_finish_reason?: string;
  }>;
}

async function makeOpenrouterRequest(
  env: Env,
  endpoint: string,
  body: any,
): Promise<GeminiResponse> {
  assertEnvKey(env, "NANOBANANA_API_KEY");

  const url = `${OPENROUTER_BASE_URL}${endpoint}`;

  const data = (await makeApiRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.NANOBANANA_API_KEY}`,
      },
      body: JSON.stringify(body),
    },
    "Openrouter",
  )) as OpenRouterResponse;
  const choices = data.choices[0];

  const image = choices.message.images?.[0]?.image_url?.url;
  const nativeFinishReason = choices.native_finish_reason;

  if (!image) {
    throw new Error("No image generated in the response");
  }

  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inline_data: {
                data: image,
                mime_type: "image/png",
              },
            },
          ],
        },
        finishReason: nativeFinishReason,
      },
    ],
  };
}

export async function generateImage(
  env: Env,
  prompt: string,
  imageUrl?: string,
  aspectRatio?: string,
  model?: Model,
): Promise<GeminiResponse> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (imageUrl) {
    content.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  const modelToUse = model || "gemini-2.5-flash-image-preview";

  const body: any = {
    model: `google/${modelToUse}`,
    messages: [
      {
        role: "user",
        content,
      },
    ],
    modalities: ["image", "text"],
  };

  if (aspectRatio) {
    body.image_config = {
      aspect_ratio: aspectRatio,
    };
  }

  return makeOpenrouterRequest(env, "chat/completions", body);
}

export const createGeminiClient = (env: Env) => ({
  generateImage: (
    prompt: string,
    imageUrl?: string,
    aspectRatio?: string,
    model?: Model,
  ) => generateImage(env, prompt, imageUrl, aspectRatio, model),
});
