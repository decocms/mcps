import type { Env } from "server/main.ts";
import { createVeoClient, VeoModels, type VeoModel } from "./utils/veo.ts";
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";
import {
  OPERATION_MAX_WAIT_MS,
  OPERATION_POLL_INTERVAL_MS,
} from "../constants.ts";

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

export const veoTools = createVideoGeneratorTools<
  Env,
  ReturnType<typeof createVeoClient>,
  VeoModel
>({
  metadata: {
    provider: "Veo",
    description: "Generate videos using Veo",
    models: VeoModels.options,
    defaultModel: "veo-3.1-generate-preview",
  },
  getStorage: (env) => {
    const objectStorage = getObjectStorage(env);
    return createStorageAdapter(objectStorage);
  },
  getClient: (env) => createVeoClient(env),

  generateTool: {
    execute: async ({ client, input }) => {
      const modelToUse = input.model ?? "veo-3.1-generate-preview";
      const parsedModel: VeoModel = VeoModels.parse(modelToUse);

      const veoAspectRatio =
        input.aspectRatio === "16:9" || input.aspectRatio === "9:16"
          ? input.aspectRatio
          : "16:9";

      // Start video generation
      const operation = await client.generateVideo(input.prompt, parsedModel, {
        aspectRatio: veoAspectRatio,
        durationSeconds: input.duration,
        referenceImages: input.referenceImages,
        firstFrameImageUrl: input.firstFrameUrl,
        lastFrameImageUrl: input.lastFrameUrl,
        personGeneration: input.personGeneration,
        negativePrompt: input.negativePrompt,
      });

      // Poll until complete (6 minutes max, poll every 10 seconds)
      const completed = await client.pollOperationUntilComplete(
        operation.name,
        OPERATION_MAX_WAIT_MS,
        OPERATION_POLL_INTERVAL_MS,
      );

      // Check if completed successfully
      if (!completed.done || !completed.response?.generateVideoResponse) {
        return {
          error: true,
          finishReason: "operation_not_completed",
        };
      }

      const generatedSamples =
        completed.response.generateVideoResponse.generatedSamples;
      if (!generatedSamples || generatedSamples.length === 0) {
        return {
          error: true,
          finishReason: "no_video_generated",
        };
      }

      const video = generatedSamples[0];
      const videoStream = await client.downloadVideo(video.video.uri);

      return {
        data: videoStream,
        mimeType: video.video.mimeType || "video/mp4",
        operationName: operation.name,
      };
    },
  },
  extendTool: {
    execute: async ({ client, input }) => {
      // Parse and validate model with default fallback
      const modelToUse = input.model ?? "veo-3.1-generate-preview";
      const parsedModel: VeoModel = VeoModels.parse(modelToUse);

      const operation = await client.extendVideo(
        input.videoId,
        input.prompt,
        parsedModel,
      );

      // Poll until complete (6 minutes max, poll every 10 seconds)
      const completed = await client.pollOperationUntilComplete(
        operation.name,
        OPERATION_MAX_WAIT_MS,
        OPERATION_POLL_INTERVAL_MS,
      );

      // Check if completed successfully
      if (!completed.done || !completed.response?.generateVideoResponse) {
        return {
          error: true,
          finishReason: "operation_not_completed",
        };
      }

      const generatedSamples =
        completed.response.generateVideoResponse.generatedSamples;
      if (!generatedSamples || generatedSamples.length === 0) {
        return {
          error: true,
          finishReason: "no_video_generated",
        };
      }

      const video = generatedSamples[0];
      const videoStream = await client.downloadVideo(video.video.uri);

      return {
        data: videoStream,
        mimeType: video.video.mimeType || "video/mp4",
        operationName: operation.name,
      };
    },
  },
});
