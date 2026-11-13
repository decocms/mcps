/**
 * Image generation tools (OpenRouter `POST /images`).
 *
 * Registered only by this MCP's own entrypoint (server/main.ts), never through
 * the exported `tools`: deco-llm imports those and bills calls through its
 * wallet hooks, which cover LLM usage only.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { OPENROUTER_BASE_URL } from "../constants.ts";
import type { Env } from "../main.ts";

const IMAGES_ENDPOINT = `${OPENROUTER_BASE_URL}/images`;
const IMAGE_MODELS_ENDPOINT = `${OPENROUTER_BASE_URL}/images/models`;
const GENERATE_TIMEOUT_MS = 240_000;
const REFERENCE_TIMEOUT_MS = 30_000;
const MAX_REFERENCES = 16;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MODELS_CACHE_TTL_MS = 60 * 60 * 1000;

const ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

/**
 * The connection's own OpenRouter key. Image generation is billed to whoever
 * connected the account, so unlike the LLM tools there is no fallback to the
 * deployment's key.
 */
export function requireConnectionKey(authorization?: string | null): string {
  const key = authorization?.trim();
  if (!key) {
    throw new Error(
      "This OpenRouter connection has no account key. Connect an OpenRouter account to generate images.",
    );
  }
  return key;
}

export const generateImageInputSchema = z.object({
  model: z
    .string()
    .min(1)
    .describe(
      "Image model id from IMAGE_MODELS_LIST, e.g. openai/gpt-image-2.6-sunburst",
    ),
  prompt: z.string().min(1).max(32_000).describe("What to generate or change"),
  references: z
    .array(z.string().url())
    .max(MAX_REFERENCES)
    .optional()
    .describe(
      "Reference images as https or data: URLs, in order (image 1 first). The model's own limit (IMAGE_MODELS_LIST maxReferences) applies.",
    ),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional()
    .describe(
      "Output size in pixels, e.g. 1536x2304 (OpenAI GPT Image models). Other models use aspectRatio.",
    ),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  quality: z.enum(["low", "medium", "high", "auto"]).optional(),
  moderation: z
    .enum(["auto", "low"])
    .optional()
    .describe(
      "OpenAI models only: 'low' asks for the least restrictive moderation. Default is the provider's.",
    ),
  outputPutUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Presigned URL the image is uploaded to with PUT. Recommended: without it the image comes back inline as a data URL, which is several megabytes.",
    ),
});

export type GenerateImageInput = z.infer<typeof generateImageInputSchema>;

/** The OpenRouter request body. References must already be data URLs. */
export function buildImageRequest(
  input: GenerateImageInput,
  referenceDataUrls: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    n: 1,
  };
  if (referenceDataUrls.length > 0) {
    body.input_references = referenceDataUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
  }
  if (input.size) body.size = input.size;
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  if (input.quality) body.quality = input.quality;
  // OpenRouter ignores a top-level `moderation`; OpenAI only reads it here.
  if (input.moderation && input.model.startsWith("openai/")) {
    body.provider = { options: { openai: { moderation: input.moderation } } };
  }
  return body;
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`Reference ${parsed.host} must use https`);
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REFERENCE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Reference ${parsed.host} answered ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new Error(`Reference ${parsed.host} is larger than 10 MB`);
  }
  const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!type.startsWith("image/")) {
    throw new Error(`Reference ${parsed.host} is not an image (${type})`);
  }
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

async function readGeneratedImage(item: {
  b64_json?: string;
  url?: string;
  media_type?: string;
}): Promise<GeneratedImage | null> {
  const mimeType = item.media_type || "image/png";
  if (item.b64_json) {
    return { bytes: Buffer.from(item.b64_json, "base64"), mimeType };
  }
  const dataUrl = item.url?.match(/^data:([^;]+);base64,(.*)$/);
  if (dataUrl) {
    return { bytes: Buffer.from(dataUrl[2], "base64"), mimeType: dataUrl[1] };
  }
  if (item.url) {
    const res = await fetch(item.url, {
      signal: AbortSignal.timeout(REFERENCE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Generated image answered ${res.status}`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mimeType: res.headers.get("content-type") || mimeType,
    };
  }
  return null;
}

export const createImageGenerateTool = (env: Env) =>
  createPrivateTool({
    id: "IMAGE_GENERATE",
    description:
      "Generate or edit one image with an OpenRouter image model, billed to the connected OpenRouter account. " +
      "Pass reference images to edit or to copy a product. Returns the cost in USD. " +
      "A content filter refusal comes back as an error mentioning moderation or safety.",
    inputSchema: generateImageInputSchema,
    outputSchema: z.object({
      model: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      cost: z.number().nullable().describe("USD, as reported by OpenRouter"),
      stored: z
        .boolean()
        .describe("True when the image was uploaded to outputPutUrl"),
      dataUrl: z
        .string()
        .optional()
        .describe("The image, only when outputPutUrl was not given"),
    }),
    execute: async ({ context }) => {
      const key = requireConnectionKey(env.MESH_REQUEST_CONTEXT.authorization);
      const references = await Promise.all(
        (context.references ?? []).map(toDataUrl),
      );
      const res = await fetch(IMAGES_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "deco Studio",
        },
        body: JSON.stringify(buildImageRequest(context, references)),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
      const text = await res.text();
      let data: {
        data?: Array<{ b64_json?: string; url?: string; media_type?: string }>;
        usage?: { cost?: number };
        error?: { message?: string } | string;
      };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `OpenRouter answered ${res.status}: ${text.slice(0, 300)}`,
        );
      }
      if (!res.ok || data.error) {
        const message =
          typeof data.error === "string" ? data.error : data.error?.message;
        throw new Error(
          `OpenRouter answered ${res.status}: ${message ?? text.slice(0, 300)}`,
        );
      }
      const image = data.data?.[0]
        ? await readGeneratedImage(data.data[0])
        : null;
      if (!image) {
        throw new Error(
          "The model returned no image (possibly refused by its content filter)",
        );
      }
      const cost =
        typeof data.usage?.cost === "number" ? data.usage.cost : null;

      if (context.outputPutUrl) {
        const upload = await fetch(context.outputPutUrl, {
          method: "PUT",
          headers: { "Content-Type": image.mimeType },
          body: new Uint8Array(image.bytes),
        });
        if (!upload.ok) {
          throw new Error(`Uploading the image answered ${upload.status}`);
        }
        return {
          model: context.model,
          mimeType: image.mimeType,
          sizeBytes: image.bytes.byteLength,
          cost,
          stored: true,
        };
      }
      return {
        model: context.model,
        mimeType: image.mimeType,
        sizeBytes: image.bytes.byteLength,
        cost,
        stored: false,
        dataUrl: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`,
      };
    },
  });

const imageModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  maxReferences: z
    .number()
    .describe("How many reference images the model accepts (0 = none)"),
  parameters: z.array(z.string()).describe("Supported request parameters"),
});

let modelsCache: {
  at: number;
  models: z.infer<typeof imageModelSchema>[];
} | null = null;

export const createImageModelsListTool = (_env: Env) =>
  createPrivateTool({
    id: "IMAGE_MODELS_LIST",
    description:
      "List the image models OpenRouter offers for IMAGE_GENERATE, with how many reference images each accepts.",
    inputSchema: z.object({
      search: z
        .string()
        .optional()
        .describe("Case-insensitive filter on the model id or name"),
    }),
    outputSchema: z.object({ models: z.array(imageModelSchema) }),
    execute: async ({ context }) => {
      if (!modelsCache || Date.now() - modelsCache.at > MODELS_CACHE_TTL_MS) {
        const res = await fetch(IMAGE_MODELS_ENDPOINT, {
          signal: AbortSignal.timeout(REFERENCE_TIMEOUT_MS),
        });
        if (!res.ok) {
          throw new Error(`OpenRouter image models answered ${res.status}`);
        }
        const body = (await res.json()) as {
          data?: Array<{
            id: string;
            name?: string;
            description?: string;
            supported_parameters?: Record<string, { max?: number }>;
          }>;
        };
        modelsCache = {
          at: Date.now(),
          models: (body.data ?? []).map((model) => ({
            id: model.id,
            name: model.name ?? model.id,
            description: model.description ?? "",
            maxReferences:
              model.supported_parameters?.input_references?.max ?? 0,
            parameters: Object.keys(model.supported_parameters ?? {}),
          })),
        };
      }
      const search = context.search?.trim().toLowerCase();
      const models = search
        ? modelsCache.models.filter(
            (model) =>
              model.id.toLowerCase().includes(search) ||
              model.name.toLowerCase().includes(search),
          )
        : modelsCache.models;
      return { models };
    },
  });

export const imageTools = (env: Env) => [
  createImageModelsListTool(env),
  createImageGenerateTool(env),
];
