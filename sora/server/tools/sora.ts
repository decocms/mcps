import type { Env } from "server/main";
import { createSoraClient } from "./utils/sora";
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";
import {
  OPERATION_MAX_WAIT_MS,
  OPERATION_POLL_INTERVAL_MS,
} from "../constants";

function mapAspectRatioToSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1280x720";
    case "9:16":
      return "720x1280";
    case "1:1":
      return "1024x1024";
    default:
      return "720x1280";
  }
}

function mapDuration(duration?: number): string {
  if (!duration) return "4";

  if (duration <= 4) return "4";
  if (duration <= 8) return "8";
  return "12";
}

export const soraTools = createVideoGeneratorTools<Env>({
  metadata: {
    provider: "Sora 2",
    description: "Generate videos using OpenAI Sora 2",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.SORA2_CONTRACT,
    clause: {
      clauseId: "sora-2:createVideo",
      amount: 1,
    },
  }),
  listVideos: async ({ env, input }) => {
    const client = createSoraClient(env);

    const response = await client.listVideos(input.limit, input.after);

    return {
      videos: response.data.map((video) => ({
        id: video.id,
        status: video.status,
        prompt: video.prompt,
        model: video.model,
        created_at: video.created_at,
        duration: video.duration,
        url: video.url,
      })),
      has_more: response.has_more,
      first_id: response.first_id,
      last_id: response.last_id,
    };
  },
  extendVideo: async ({ env, input }) => {
    const client = createSoraClient(env);

    const remixResponse = await client.remixVideo(input.videoId, input.prompt);

    // Poll until complete
    const videoResponse = await client.pollVideoUntilComplete(
      remixResponse.id,
      OPERATION_MAX_WAIT_MS,
      OPERATION_POLL_INTERVAL_MS,
    );

    if (videoResponse.status === "failed") {
      return {
        error: true,
        finishReason: videoResponse.error?.message || "video_extension_failed",
      };
    }

    if (videoResponse.status !== "completed") {
      return {
        error: true,
        finishReason: "operation_timeout",
      };
    }

    const videoBlob = await client.downloadVideoContent(remixResponse.id);

    return {
      data: videoBlob,
      mimeType: "video/mp4",
      operationName: remixResponse.id,
    };
  },
  execute: async ({ env, input }) => {
    const client = createSoraClient(env);

    const size = mapAspectRatioToSize(input.aspectRatio);

    const seconds = mapDuration(input.duration);

    const inputReferenceUrl = input.baseImageUrl || input.firstFrameUrl;

    const createResponse = await client.createVideo(
      input.prompt,
      "sora-2", // default model
      seconds,
      size,
      inputReferenceUrl,
    );

    // Poll until complete (10 minutes max, poll every 10 seconds)
    const videoResponse = await client.pollVideoUntilComplete(
      createResponse.id,
      OPERATION_MAX_WAIT_MS,
      OPERATION_POLL_INTERVAL_MS,
    );

    if (videoResponse.status === "failed") {
      return {
        error: true,
        finishReason: videoResponse.error?.message || "video_generation_failed",
      };
    }

    if (videoResponse.status !== "completed") {
      return {
        error: true,
        finishReason: "operation_timeout",
      };
    }

    const videoBlob = await client.downloadVideoContent(createResponse.id);

    return {
      data: videoBlob,
      mimeType: "video/mp4",
      operationName: createResponse.id,
    };
  },
});
