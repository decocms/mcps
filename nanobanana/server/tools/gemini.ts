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
  baseImageUrls: z
    .array(z.string().url())
    .optional()
    .describe(
      "Array of image URLs to use as base (for multi-image generation like virtual try-on). If provided, takes precedence over baseImageUrl.",
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

        // Determine which images to use (baseImageUrls takes precedence)
        const imageUrls = context.baseImageUrls?.length
          ? context.baseImageUrls
          : context.baseImageUrl
            ? [context.baseImageUrl]
            : undefined;

        console.log(
          `[GENERATE_IMAGE] model=${parsedModel}, prompt="${context.prompt.slice(0, 80)}", images=${imageUrls?.length ?? 0}`,
        );

        const t0 = performance.now();
        const client = createGeminiClient(env);
        const result = await client.generateImage(
          context.prompt,
          imageUrls,
          context.aspectRatio,
          parsedModel,
        );
        const genMs = Math.round(performance.now() - t0);
        console.log(
          `[GENERATE_IMAGE] OpenRouter responded in ${genMs}ms — finishReason=${result.finishReason}, hasImage=${!!result.imageData}, mimeType=${result.mimeType}`,
        );

        if (!result.imageData) {
          console.warn(
            `[GENERATE_IMAGE] No image data returned. finishReason=${result.finishReason}`,
          );
          return {
            error: true,
            finishReason: result.finishReason,
          };
        }

        const mimeType = result.mimeType ?? "image/png";
        const extension = mimeType.split("/")[1] || "png";
        const name = new Date().toISOString().replace(/[:.]/g, "-");
        const path = `images/${name}.${extension}`;

        console.log(
          `[GENERATE_IMAGE] Requesting presigned URLs — path=${path}, contentType=${mimeType}`,
        );

        const t1 = performance.now();
        const objectStorage = getObjectStorage(env);
        const storage = createStorageAdapter(objectStorage);

        const [readUrl, writeUrl] = await Promise.all([
          storage.createPresignedReadUrl({ key: path, expiresIn: 3600 }),
          storage.createPresignedPutUrl({
            key: path,
            contentType: mimeType,
            metadata: { prompt: context.prompt },
            expiresIn: 300,
          }),
        ]);
        const urlMs = Math.round(performance.now() - t1);
        console.log(`[GENERATE_IMAGE] Presigned URLs obtained in ${urlMs}ms`);

        const base64Data = result.imageData.includes(",")
          ? result.imageData.split(",")[1]
          : result.imageData;
        const imageBuffer = Buffer.from(base64Data!, "base64");
        console.log(
          `[GENERATE_IMAGE] Uploading ${imageBuffer.byteLength} bytes to S3...`,
        );

        const t2 = performance.now();
        const uploadResponse = await fetch(writeUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: imageBuffer,
        });
        const uploadMs = Math.round(performance.now() - t2);

        if (!uploadResponse.ok) {
          const body = await uploadResponse.text().catch(() => "(no body)");
          console.error(
            `[GENERATE_IMAGE] Upload FAILED in ${uploadMs}ms — status=${uploadResponse.status} ${uploadResponse.statusText}`,
          );
          console.error(`[GENERATE_IMAGE] Upload error body: ${body}`);
          console.error(
            `[GENERATE_IMAGE] writeUrl: ${writeUrl.slice(0, 120)}...`,
          );
          throw new Error(
            `Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText} — ${body}`,
          );
        }

        const totalMs = Math.round(performance.now() - t0);
        console.log(
          `[GENERATE_IMAGE] Done in ${totalMs}ms (gen=${genMs}ms, urls=${urlMs}ms, upload=${uploadMs}ms)`,
        );

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
