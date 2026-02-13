import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  AspectRatioSchema,
  GenerateImageOutputSchema,
} from "@decocms/mcps-shared/image-generators";
import {
  applyMiddlewares,
  withLogging,
  withRetry,
  withTimeout,
} from "@decocms/mcps-shared/tools/utils/middleware";
import type { Env } from "server/main.ts";
import { createGeminiClient, models, type Model } from "./utils/gemini.ts";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 120_000;

const GenerateImageInputSchema = z.object({
  prompt: z
    .string()
    .describe("The text prompt describing the image to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "URL of an existing image to use as base (image-to-image generation)",
    ),
  aspectRatio: AspectRatioSchema.optional().describe(
    "Aspect ratio for the generated image (default: 1:1)",
  ),
  model: z
    .enum(models.options)
    .optional()
    .describe(
      "Model to use for image generation (default: gemini-2.5-flash-image-preview)",
    ),
});

type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

/** Minimal interface for the resolved OBJECT_STORAGE binding */
interface ObjectStorageBinding {
  GET_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
  }) => Promise<{ url: string; expiresIn: number }>;
  PUT_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
    contentType?: string;
  }) => Promise<{ url: string; expiresIn: number }>;
}

/**
 * Gets the OBJECT_STORAGE binding from the environment state.
 * At runtime, BindingOf bindings are resolved into MCP client stubs.
 */
function getObjectStorage(env: Env): ObjectStorageBinding {
  const storage = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE;
  if (!storage) {
    throw new Error(
      "OBJECT_STORAGE binding is not configured. Please connect an object-storage MCP.",
    );
  }
  // At runtime, BindingOf bindings are resolved into Proxy-based MCP
  // client stubs with dynamic methods (GET_PRESIGNED_URL, PUT_PRESIGNED_URL, etc.)
  // TypeScript doesn't see these dynamic props, so we cast through unknown.
  return storage as unknown as ObjectStorageBinding;
}

/**
 * Creates a minimal storage adapter from the resolved OBJECT_STORAGE binding.
 */
function createStorageAdapter(objectStorage: ObjectStorageBinding) {
  return {
    createPresignedReadUrl: async ({
      key,
      expiresIn,
    }: {
      key: string;
      expiresIn?: number;
    }) => {
      const { url } = await objectStorage.GET_PRESIGNED_URL({
        key,
        expiresIn: expiresIn ?? 3600,
      });
      return url;
    },
    createPresignedPutUrl: async ({
      key,
      contentType,
      expiresIn,
    }: {
      key: string;
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn: number;
    }) => {
      const { url } = await objectStorage.PUT_PRESIGNED_URL({
        key,
        contentType: contentType ?? "application/octet-stream",
        expiresIn,
      });
      return url;
    },
  };
}

const createGenerateImageTool = (env: Env) =>
  createPrivateTool({
    id: "GENERATE_IMAGE",
    description: "Generate images using Gemini models via OpenRouter",
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
    execute: async ({ context }: { context: GenerateImageInput }) => {
      const doExecute = async () => {
        const modelToUse = (context.model ??
          "gemini-2.5-flash-image-preview") as Model;
        const parsedModel: Model = models.parse(modelToUse);

        const objectStorage = getObjectStorage(env);
        const storage = createStorageAdapter(objectStorage);

        // Pre-compute the file path so we can fetch presigned URLs
        // in parallel with image generation (saves mesh round-trip time).
        const defaultMime = "image/png";
        const extension = "png";
        const name = new Date().toISOString().replace(/[:.]/g, "-");
        const path = `/images/${name}.${extension}`;

        // Start image generation AND presigned URL fetching in parallel
        const client = createGeminiClient(env);
        const [result, readUrl, writeUrl] = await Promise.all([
          client.generateImage(
            context.prompt,
            context.baseImageUrl || undefined,
            context.aspectRatio,
            parsedModel,
          ),
          storage.createPresignedReadUrl({ key: path, expiresIn: 3600 }),
          storage.createPresignedPutUrl({
            key: path,
            contentType: defaultMime,
            metadata: { prompt: context.prompt },
            expiresIn: 300,
          }),
        ]);

        if (!result.imageData) {
          return {
            error: true,
            finishReason: result.finishReason,
          };
        }

        // Upload image using the pre-fetched presigned URL
        const base64Data = result.imageData.includes(",")
          ? result.imageData.split(",")[1]
          : result.imageData;
        const imageBuffer = Buffer.from(base64Data!, "base64");

        const uploadResponse = await fetch(writeUrl, {
          method: "PUT",
          headers: { "Content-Type": result.mimeType ?? defaultMime },
          body: imageBuffer,
        });

        if (!uploadResponse.ok) {
          throw new Error(
            `Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText}`,
          );
        }

        return {
          image: readUrl,
          finishReason: result.finishReason,
        };
      };

      const withMiddlewares = applyMiddlewares({
        fn: doExecute,
        middlewares: [
          withLogging({
            title: "Gemini via OpenRouter",
            startMessage: "Starting image generation...",
          }),
          withRetry(MAX_RETRIES),
          withTimeout(TIMEOUT_MS),
        ],
      });

      return withMiddlewares();
    },
  });

export const geminiTools = [createGenerateImageTool];
