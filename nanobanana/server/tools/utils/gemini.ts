import { OPENROUTER_BASE_URL } from "server/constants.ts";
import type { Env } from "server/types/env.ts";
import { z } from "zod";
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";

export const models = z.enum([
  "gemini-2.0-flash-exp",
  "gemini-2.5-flash-image-preview",
  "gemini-2.5-pro-image-preview",
  "gemini-2.5-pro-exp-03-25",
  "gemini-3-pro-image-preview",
]);
export type Model = z.infer<typeof models>;

/** Result of an image generation request */
export interface ImageGenerationResult {
  /** URL of the generated image (hosted by OpenRouter) */
  imageUrl: string;
  /** Native finish reason from the model */
  finishReason?: string;
}

interface OpenRouterImageUrl {
  url: string;
}

interface OpenRouterImage {
  image_url?: OpenRouterImageUrl;
}

interface OpenRouterMessage {
  images?: OpenRouterImage[];
}

interface OpenRouterChoice {
  message: OpenRouterMessage;
  native_finish_reason?: string;
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

interface OpenRouterRequestContent {
  type: string;
  text?: string;
  image_url?: OpenRouterImageUrl;
}

interface OpenRouterRequestMessage {
  role: string;
  content: OpenRouterRequestContent[];
}

interface OpenRouterImageConfig {
  aspect_ratio: string;
}

interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterRequestMessage[];
  modalities: string[];
  image_config?: OpenRouterImageConfig;
}

function getApiKey(env: Env): string {
  const apiKey = env.MESH_REQUEST_CONTEXT.state.NANOBANANA_API_KEY;
  if (!apiKey) {
    throw new Error("NANOBANANA_API_KEY is not set in configuration");
  }
  return apiKey;
}

async function makeOpenrouterRequest(
  env: Env,
  endpoint: string,
  body: OpenRouterRequestBody,
): Promise<ImageGenerationResult> {
  const apiKey = getApiKey(env);
  const url = `${OPENROUTER_BASE_URL}${endpoint}`;

  const data = await makeApiRequest<OpenRouterResponse>(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    "Openrouter",
  );
  const choices = data.choices[0];

  const imageUrl = choices.message.images?.[0]?.image_url?.url;
  const finishReason = choices.native_finish_reason;

  if (!imageUrl) {
    throw new Error("No image generated in the response");
  }

  return { imageUrl, finishReason };
}

export async function generateImage(
  env: Env,
  prompt: string,
  imageUrl?: string,
  aspectRatio?: string,
  model?: Model,
): Promise<ImageGenerationResult> {
  const content: OpenRouterRequestContent[] = [{ type: "text", text: prompt }];
  if (imageUrl) {
    content.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  const modelToUse = model || "gemini-2.5-flash-image-preview";

  const body: OpenRouterRequestBody = {
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
