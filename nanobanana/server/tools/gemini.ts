import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  AspectRatioSchema,
  GenerateImageOutputSchema,
  saveImage,
  type SaveImageOptions,
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

/** Minimal interface for the resolved FILE_SYSTEM binding */
interface FileSystemBinding {
  FS_READ: (input: {
    path: string;
    expiresIn?: number;
  }) => Promise<{ url: string }>;
  FS_WRITE: (input: {
    path: string;
    contentType: string;
    expiresIn?: number;
  }) => Promise<{ url: string }>;
}

/**
 * Gets the FILE_SYSTEM binding from the environment state.
 * At runtime, BindingOf bindings are resolved into MCP client stubs.
 */
function getFileSystem(env: Env): FileSystemBinding {
  const ctx = env.MESH_REQUEST_CONTEXT;
  console.log("[NANOBANANA] MESH_REQUEST_CONTEXT debug:", {
    hasContext: !!ctx,
    hasToken: !!ctx?.token,
    tokenPreview: ctx?.token ? `${ctx.token.substring(0, 50)}...` : "none",
    meshUrl: ctx?.meshUrl,
    connectionId: ctx?.connectionId,
    organizationId: ctx?.organizationId,
    stateKeys: ctx?.state ? Object.keys(ctx.state) : [],
    hasFileSystem: !!ctx?.state?.FILE_SYSTEM,
    fileSystemType: ctx?.state?.FILE_SYSTEM
      ? typeof ctx.state.FILE_SYSTEM
      : "undefined",
    fileSystemKeys: ctx?.state?.FILE_SYSTEM
      ? Object.keys(ctx.state.FILE_SYSTEM as Record<string, unknown>)
      : [],
  });

  const fs = ctx?.state?.FILE_SYSTEM;
  if (!fs) {
    throw new Error(
      "FILE_SYSTEM binding is not configured. Please connect a file-system MCP.",
    );
  }
  // At runtime, BindingOf bindings are resolved into Proxy-based MCP
  // client stubs with dynamic methods (FS_READ, FS_WRITE, etc.)
  // TypeScript doesn't see these dynamic props, so we cast through unknown.
  return fs as unknown as FileSystemBinding;
}

/**
 * Creates a minimal storage adapter from the resolved FILE_SYSTEM binding.
 */
function createStorageFromFileSystem(fileSystem: FileSystemBinding) {
  return {
    createPresignedReadUrl: async ({
      key,
      expiresIn,
    }: {
      key: string;
      expiresIn?: number;
    }) => {
      const { url } = await fileSystem.FS_READ({
        path: key,
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
      const { url } = await fileSystem.FS_WRITE({
        path: key,
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

        const client = createGeminiClient(env);
        const result = await client.generateImage(
          context.prompt,
          context.baseImageUrl || undefined,
          context.aspectRatio,
          parsedModel,
        );

        if (!result.imageData) {
          return {
            error: true,
            finishReason: result.finishReason,
          };
        }

        const fileSystem = getFileSystem(env);
        const storage = createStorageFromFileSystem(fileSystem);
        const saveOptions: SaveImageOptions = {
          imageData: result.imageData,
          mimeType: result.mimeType ?? "image/png",
          metadata: { prompt: context.prompt },
        };

        const saved = await saveImage(storage, saveOptions);

        return {
          image: saved.url,
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
