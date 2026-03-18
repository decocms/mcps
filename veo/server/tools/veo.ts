import type { Env } from "server/main.ts";
import { createVeoClient, VeoModels, type VeoModel } from "./utils/veo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  saveVideo,
  createGenerateVideoInputSchema,
  createExtendVideoInputSchema,
} from "@decocms/mcps-shared/video-generators";
import { z } from "zod";

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

// Schemas
const generateVideoInputSchema = createGenerateVideoInputSchema(
  VeoModels.options,
  "veo-3.1-generate-preview",
);

const extendVideoInputSchema = createExtendVideoInputSchema(
  VeoModels.options,
  "veo-3.1-generate-preview",
);

const GenerateVideoOutputSchema = z.object({
  operationName: z
    .string()
    .describe(
      "Operation name to use with GET_GENERATED_VIDEO to check status and retrieve the video",
    ),
  status: z.string().describe("Current status of the video generation"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Error reason if failed"),
});

const GetGeneratedVideoInputSchema = z.object({
  operationName: z
    .string()
    .describe("The operation name returned by GENERATE_VIDEO or EXTEND_VIDEO"),
});

const GetGeneratedVideoOutputSchema = z.object({
  status: z
    .enum(["processing", "completed", "failed"])
    .describe("Current status of the video generation"),
  operationName: z.string().describe("The operation name for reference"),
  video: z
    .string()
    .optional()
    .describe("URL of the generated video (when completed)"),
  error: z.string().optional().describe("Error message if failed"),
});

const ExtendVideoOutputSchema = z.object({
  operationName: z
    .string()
    .describe(
      "Operation name to use with GET_GENERATED_VIDEO to check status and retrieve the video",
    ),
  status: z.string().describe("Current status of the video extension"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Error reason if failed"),
});

// Tool factories

const createGenerateVideoTool = (env: Env) =>
  createPrivateTool({
    id: "GENERATE_VIDEO",
    description:
      "Start generating a video using Google Veo. Returns an operation name immediately. Use GET_GENERATED_VIDEO with the operation name to check status and retrieve the video once ready.",
    inputSchema: generateVideoInputSchema,
    outputSchema: GenerateVideoOutputSchema,
    execute: async ({ context }) => {
      const client = createVeoClient(env);

      const modelToUse = context.model ?? "veo-3.1-generate-preview";
      const parsedModel: VeoModel = VeoModels.parse(modelToUse);

      const veoAspectRatio =
        context.aspectRatio === "16:9" || context.aspectRatio === "9:16"
          ? context.aspectRatio
          : "16:9";

      const operation = await client.generateVideo(
        context.prompt,
        parsedModel,
        {
          aspectRatio: veoAspectRatio,
          durationSeconds: context.duration,
          referenceImages: context.referenceImages,
          firstFrameImageUrl: context.firstFrameUrl,
          lastFrameImageUrl: context.lastFrameUrl,
          personGeneration: context.personGeneration,
          negativePrompt: context.negativePrompt,
        },
      );

      return {
        operationName: operation.name,
        status: "processing",
      };
    },
  });

const createGetGeneratedVideoTool = (env: Env) =>
  createPrivateTool({
    id: "GET_GENERATED_VIDEO",
    description:
      "Check the status of a video generation operation and retrieve the video URL when completed. Use the operationName returned by GENERATE_VIDEO or EXTEND_VIDEO.",
    inputSchema: GetGeneratedVideoInputSchema,
    outputSchema: GetGeneratedVideoOutputSchema,
    execute: async ({ context }) => {
      const client = createVeoClient(env);
      const { operationName } = context;

      const operation = await client.getOperationStatus(operationName);

      // Still processing
      if (!operation.done) {
        return {
          status: "processing" as const,
          operationName,
        };
      }

      // Check for API-level errors
      if (operation.error) {
        return {
          status: "failed" as const,
          operationName,
          error: operation.error.message,
        };
      }

      // Check for missing video response
      const generatedSamples =
        operation.response?.generateVideoResponse?.generatedSamples;
      if (!generatedSamples || generatedSamples.length === 0) {
        return {
          status: "failed" as const,
          operationName,
          error: "No video was generated",
        };
      }

      // Download video into a buffer (S3 presigned PUT requires Content-Length)
      const video = generatedSamples[0];
      const mimeType = video.video.mimeType || "video/mp4";
      const videoStream = await client.downloadVideo(video.video.uri);
      const videoBlob = new Blob(
        [await new Response(videoStream).arrayBuffer()],
        { type: mimeType },
      );

      const objectStorage = getObjectStorage(env);
      const storage = createStorageAdapter(objectStorage);

      const saveResult = await saveVideo(storage, {
        videoData: videoBlob,
        mimeType,
        metadata: {
          operationName,
        },
        fileName: operationName.replaceAll("/", "_"),
      });

      return {
        status: "completed" as const,
        operationName,
        video: saveResult.url,
      };
    },
  });

const createExtendVideoTool = (env: Env) =>
  createPrivateTool({
    id: "EXTEND_VIDEO",
    description:
      "Start extending or remixing an existing video using Google Veo. Returns an operation name immediately. Use GET_GENERATED_VIDEO with the operation name to check status and retrieve the video once ready.",
    inputSchema: extendVideoInputSchema,
    outputSchema: ExtendVideoOutputSchema,
    execute: async ({ context }) => {
      const client = createVeoClient(env);

      const modelToUse = context.model ?? "veo-3.1-generate-preview";
      const parsedModel: VeoModel = VeoModels.parse(modelToUse);

      const operation = await client.extendVideo(
        context.videoId,
        context.prompt,
        parsedModel,
      );

      return {
        operationName: operation.name,
        status: "processing",
      };
    },
  });

export const veoTools = [
  createGenerateVideoTool,
  createGetGeneratedVideoTool,
  createExtendVideoTool,
];
