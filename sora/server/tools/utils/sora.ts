import { OPENAI_BASE_URL, OPENAI_VIDEOS_ENDPOINT } from "server/constants";
import { Env } from "server/main";
import z from "zod";

// Sora 2 models
export const models = z.enum(["sora-2"]);

// Video Response Schema
export const VideoResponseSchema = z.object({
  id: z.string(),
  object: z.literal("video"),
  status: z.enum([
    "queued",
    "pending",
    "processing",
    "in_progress",
    "completed",
    "failed",
  ]),
  prompt: z.string().optional(),
  model: z.string(),
  created_at: z.number(),
  completed_at: z.number().nullable().optional(),
  expires_at: z.number().nullable().optional(),
  progress: z.number().optional().describe("Progress percentage (0-100)"),
  remixed_from_video_id: z.string().nullable().optional(),
  seconds: z.string().optional().describe("Video duration in seconds"),
  size: z.string().optional().describe("Video dimensions (e.g., '720x1280')"),
  duration: z.number().optional(),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  url: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
});

export type VideoResponse = z.infer<typeof VideoResponseSchema>;

// List Videos Response Schema
export const ListVideosResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(VideoResponseSchema),
  has_more: z.boolean(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});

export type ListVideosResponse = z.infer<typeof ListVideosResponseSchema>;

function assertApiKey(env: Env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
}

async function makeOpenAIRequest(
  env: Env,
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: any,
): Promise<any> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  };

  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse the error as JSON to extract meaningful message
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      // If JSON parsing fails, use the raw error text
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  return await response.json();
}

// Create Video
export async function createVideo(
  env: Env,
  prompt: string,
  model: string = "sora-2",
  seconds: string = "4",
  size: string = "720x1280",
  inputReferenceUrl?: string,
): Promise<VideoResponse> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${OPENAI_VIDEOS_ENDPOINT}`;

  // If we have an image reference, use multipart/form-data
  if (inputReferenceUrl) {
    // Fetch the image
    const imageResponse = await fetch(inputReferenceUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch input reference image: ${imageResponse.statusText}`,
      );
    }
    const imageBlob = await imageResponse.blob();

    // Create form data
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("model", model);
    formData.append("seconds", seconds);
    formData.append("size", size);
    formData.append("input_reference", imageBlob, "reference.jpg");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Try to parse the error as JSON to extract meaningful message
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage = errorJson.error?.message || errorText;
        throw new Error(errorMessage);
      } catch {
        // If JSON parsing fails, use the raw error text
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
        );
      }
    }

    const data = await response.json();
    return VideoResponseSchema.parse(data);
  }

  // Otherwise use JSON
  const body = {
    model,
    prompt,
    seconds,
    size,
  };

  const data = await makeOpenAIRequest(
    env,
    OPENAI_VIDEOS_ENDPOINT,
    "POST",
    body,
  );

  return VideoResponseSchema.parse(data);
}

// Remix Video
export async function remixVideo(
  env: Env,
  videoId: string,
  prompt: string,
): Promise<VideoResponse> {
  const body = {
    prompt,
  };

  const data = await makeOpenAIRequest(
    env,
    `${OPENAI_VIDEOS_ENDPOINT}/${videoId}/remix`,
    "POST",
    body,
  );

  return VideoResponseSchema.parse(data);
}

// List Videos
export async function listVideos(
  env: Env,
  limit: number = 20,
  after?: string,
): Promise<ListVideosResponse> {
  let endpoint = `${OPENAI_VIDEOS_ENDPOINT}?limit=${limit}`;
  if (after) {
    endpoint += `&after=${after}`;
  }

  const data = await makeOpenAIRequest(env, endpoint, "GET");

  return ListVideosResponseSchema.parse(data);
}

// Retrieve Video
export async function retrieveVideo(
  env: Env,
  videoId: string,
): Promise<VideoResponse> {
  const data = await makeOpenAIRequest(
    env,
    `${OPENAI_VIDEOS_ENDPOINT}/${videoId}`,
    "GET",
  );

  return VideoResponseSchema.parse(data);
}

// Retrieve Video Content (returns URL only, for backward compatibility)
export async function retrieveVideoContent(
  env: Env,
  videoId: string,
): Promise<{ url: string; contentType: string }> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${OPENAI_VIDEOS_ENDPOINT}/${videoId}/content`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse the error as JSON to extract meaningful message
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      // If JSON parsing fails, use the raw error text
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  // For video content, we get a direct video file or redirect URL
  const contentType = response.headers.get("content-type") || "video/mp4";

  // If it's a redirect, get the final URL
  if (response.redirected) {
    return {
      url: response.url,
      contentType,
    };
  }

  // If we get direct content, we need to handle it
  // For now, return the URL as-is
  return {
    url: response.url,
    contentType,
  };
}

// Download Video Content (returns Blob for saving to FS)
export async function downloadVideoContent(
  env: Env,
  videoId: string,
): Promise<Blob> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${OPENAI_VIDEOS_ENDPOINT}/${videoId}/content`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse the error as JSON to extract meaningful message
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      // If JSON parsing fails, use the raw error text
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  return await response.blob();
}

// Download Supporting Asset (thumbnail or spritesheet)
export async function downloadSupportingAsset(
  env: Env,
  videoId: string,
  variant: "thumbnail" | "spritesheet",
): Promise<Blob> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${OPENAI_VIDEOS_ENDPOINT}/${videoId}/content?variant=${variant}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse the error as JSON to extract meaningful message
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      // If JSON parsing fails, use the raw error text
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  return await response.blob();
}

/**
 * Poll a video until it's complete or timeout
 */
export async function pollVideoUntilComplete(
  env: Env,
  videoId: string,
  maxWaitMs: number = 600000, // 10 minutes default
  pollIntervalMs: number = 10000, // 10 seconds
): Promise<VideoResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const videoResponse = await retrieveVideo(env, videoId);

    if (
      videoResponse.status === "completed" ||
      videoResponse.status === "failed"
    ) {
      return videoResponse;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Video generation timed out after ${maxWaitMs}ms`);
}

// Convenience function to create client
export const createSoraClient = (env: Env) => ({
  createVideo: (
    prompt: string,
    model?: string,
    seconds?: string,
    size?: string,
    inputReferenceUrl?: string,
  ) => createVideo(env, prompt, model, seconds, size, inputReferenceUrl),
  remixVideo: (videoId: string, prompt: string) =>
    remixVideo(env, videoId, prompt),
  listVideos: (limit?: number, after?: string) => listVideos(env, limit, after),
  retrieveVideo: (videoId: string) => retrieveVideo(env, videoId),
  retrieveVideoContent: (videoId: string) => retrieveVideoContent(env, videoId),
  downloadVideoContent: (videoId: string) => downloadVideoContent(env, videoId),
  downloadSupportingAsset: (
    videoId: string,
    variant: "thumbnail" | "spritesheet",
  ) => downloadSupportingAsset(env, videoId, variant),
  pollVideoUntilComplete: (
    videoId: string,
    maxWaitMs?: number,
    pollIntervalMs?: number,
  ) => pollVideoUntilComplete(env, videoId, maxWaitMs, pollIntervalMs),
});
