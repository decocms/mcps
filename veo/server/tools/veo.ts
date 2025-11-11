import type { Env } from "server/main";
import { createVeoClient } from "./utils/veo";
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

export const veoTools = createVideoGeneratorTools<Env>({
  metadata: {
    provider: "Veo",
    description: "Generate videos using Veo",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.VEO3_CONTRACT,
    clause: {
      clauseId: "veo-3:generateVideo",
      amount: 1,
    },
  }),
  execute: async ({ env, input }) => {
    const client = createVeoClient(env);

    // Veo only supports 16:9 and 9:16, default to 16:9 for other ratios
    const veoAspectRatio =
      input.aspectRatio === "16:9" || input.aspectRatio === "9:16"
        ? input.aspectRatio
        : "16:9";

    // Start video generation
    const operation = await client.generateVideo(
      input.prompt,
      "veo-3.1-generate-preview",
      {
        aspectRatio: veoAspectRatio,
        durationSeconds: input.duration,
        referenceImages: input.referenceImages,
        firstFrameImageUrl: input.firstFrameUrl,
        lastFrameImageUrl: input.lastFrameUrl,
        personGeneration: input.personGeneration,
        negativePrompt: input.negativePrompt,
      },
    );

    // Poll until complete (6 minutes max, poll every 10 seconds)
    const completed = await client.pollOperationUntilComplete(
      operation.name,
      360000,
      10000,
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
});
