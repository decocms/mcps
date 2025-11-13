import { GEMINI_API_BASE_URL } from "../../constants";
import { Env } from "server/main";
import z from "zod";
import {
  assertEnvKey,
  makeApiRequest,
  parseApiError,
  pollUntilComplete,
  fetchImageAsBase64,
} from "@decocms/mcps-shared/tools/utils/api-client";

// Veo 3 model variants
export const VeoModels = z.enum([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-3.0-generate-exp",
  "veo-2.0-generate-001",
  "veo-2.0-generate-exp",
]);

export type VeoModel = z.infer<typeof VeoModels>;

// Model capabilities mapping
export const MODEL_CAPABILITIES = {
  "veo-3.1-generate-preview": {
    supportsReferenceImages: true,
    supportsLastFrame: true,
    supportsAudio: true,
    durationOptions: [4, 6, 8] as const,
    defaultDuration: 8,
  },
  "veo-3.1-fast-generate-preview": {
    supportsReferenceImages: false,
    supportsLastFrame: true,
    supportsAudio: true,
    durationOptions: [4, 6, 8] as const,
    defaultDuration: 8,
  },
  "veo-3.0-generate-001": {
    supportsReferenceImages: false,
    supportsLastFrame: false,
    supportsAudio: true,
    durationOptions: [4, 6, 8] as const,
    defaultDuration: 8,
  },
  "veo-3.0-fast-generate-001": {
    supportsReferenceImages: false,
    supportsLastFrame: false,
    supportsAudio: true,
    durationOptions: [4, 6, 8] as const,
    defaultDuration: 8,
  },
  "veo-3.0-generate-exp": {
    supportsReferenceImages: false,
    supportsLastFrame: true,
    supportsAudio: true,
    durationOptions: [4, 6, 8] as const,
    defaultDuration: 8,
  },
  "veo-2.0-generate-001": {
    supportsReferenceImages: false,
    supportsLastFrame: true,
    supportsAudio: false,
    durationOptions: [5, 6, 7, 8] as const,
    defaultDuration: 8,
  },
  "veo-2.0-generate-exp": {
    supportsReferenceImages: true,
    supportsLastFrame: true,
    supportsAudio: false,
    durationOptions: [5, 6, 7, 8] as const,
    defaultDuration: 8,
  },
} as const;

/**
 * Check if a model supports a specific feature
 */
export function modelSupports(
  model: VeoModel,
  feature: keyof (typeof MODEL_CAPABILITIES)[VeoModel],
) {
  return MODEL_CAPABILITIES[model]?.[feature] ?? false;
}

/**
 * Get valid duration options for a model
 */
export function getModelDurationOptions(model: VeoModel): readonly number[] {
  return MODEL_CAPABILITIES[model]?.durationOptions ?? [8];
}

// Video generation request schema
export const VideoGenerationRequestSchema = z.object({
  prompt: z.string().describe("Text description of the video to generate"),
  model: VeoModels.optional().default("veo-3.1-generate-preview"),
  aspectRatio: z
    .enum(["16:9", "9:16"])
    .optional()
    .describe("Video aspect ratio"),
  duration: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .optional()
    .describe("Video duration in seconds"),
  resolution: z.enum(["720p", "1080p"]).optional().describe("Video resolution"),
  referenceImages: z
    .array(
      z.object({
        url: z.string(),
      }),
    )
    .max(3)
    .optional()
    .describe("Up to 3 reference images to guide generation"),
  personGeneration: z
    .enum(["dont_allow", "allow_adult"])
    .optional()
    .describe("Control person generation in video"),
  negativePrompt: z.string().optional().describe("What to avoid in generation"),
});

// Video file schema
export const VideoFileSchema = z.object({
  name: z.string().optional(),
  uri: z.string(),
  mimeType: z.string().optional(),
  sizeBytes: z.string().optional(),
  videoBytes: z.instanceof(Uint8Array).optional(),
});

export type VideoFile = z.infer<typeof VideoFileSchema>;

// Generated video schema
export const GeneratedVideoSchema = z.object({
  video: VideoFileSchema,
});

// Operation response schema - matches actual Gemini API structure
export const OperationResponseSchema = z.object({
  name: z.string().describe("Operation identifier (e.g., 'operations/abc123')"),
  done: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the operation is complete"),
  metadata: z.any().optional(),
  response: z
    .object({
      "@type": z.string().optional(),
      generateVideoResponse: z
        .object({
          generatedSamples: z.array(
            z.object({
              video: VideoFileSchema,
            }),
          ),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});

export type OperationResponse = z.infer<typeof OperationResponseSchema>;

// Video metadata for storage
export const VideoMetadataSchema = z.object({
  operationName: z.string(),
  prompt: z.string(),
  model: z.string(),
  resolution: z.string().optional(),
  duration: z.number().optional(),
  aspectRatio: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  fileSize: z.number().optional(),
  error: z.string().optional(),
});

export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

async function makeGeminiRequest(
  env: Env,
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: any,
): Promise<any> {
  assertEnvKey(env, "GOOGLE_GENAI_API_KEY");

  const url = `${GEMINI_API_BASE_URL}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GOOGLE_GENAI_API_KEY as string,
    },
  };

  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  return await makeApiRequest(url, options, "Gemini");
}

/**
 * Generate a video using Veo model with full parameter support
 * Returns an operation that needs to be polled for completion
 */
export async function generateVideo(
  env: Env,
  prompt: string,
  model: VeoModel = "veo-3.1-generate-preview",
  options?: {
    referenceImages?: Array<{ url: string; referenceType?: "asset" | "style" }>;
    firstFrameImageUrl?: string;
    lastFrameImageUrl?: string;
    personGeneration?: "dont_allow" | "allow_adult";
    negativePrompt?: string;
    aspectRatio?: "16:9" | "9:16";
    durationSeconds?: number;
  },
): Promise<OperationResponse> {
  // Build instance object
  const instance: any = {
    prompt,
  };

  // Add reference images (only if model supports it)
  if (options?.referenceImages && options.referenceImages.length > 0) {
    if (modelSupports(model, "supportsReferenceImages")) {
      // Convert each image URL to base64
      const referenceImagesWithBase64 = await Promise.all(
        options.referenceImages.map(async (ref) => {
          const { base64, mimeType } = await fetchImageAsBase64(ref.url);
          return {
            image: {
              bytesBase64Encoded: base64,
              mimeType,
            },
            referenceType: ref.referenceType || "asset",
          };
        }),
      );
      instance.referenceImages = referenceImagesWithBase64;
    } else {
      console.warn(
        `Model ${model} does not support reference images. Ignoring.`,
      );
    }
  }

  // Add first frame image (start frame)
  if (options?.firstFrameImageUrl) {
    const { base64, mimeType } = await fetchImageAsBase64(
      options.firstFrameImageUrl,
    );
    instance.image = {
      bytesBase64Encoded: base64,
      mimeType,
    };
  }

  // Add last frame image (end frame) - only if model supports it
  if (options?.lastFrameImageUrl) {
    if (modelSupports(model, "supportsLastFrame")) {
      const { base64, mimeType } = await fetchImageAsBase64(
        options.lastFrameImageUrl,
      );
      instance.lastFrame = {
        bytesBase64Encoded: base64,
        mimeType,
      };
    } else {
      console.warn(`Model ${model} does not support lastFrame. Ignoring.`);
    }
  }

  // Build parameters object
  const parameters: any = {};

  // Add person generation
  if (options?.personGeneration) {
    parameters.personGeneration = options.personGeneration;
  }

  // Add negative prompt
  if (options?.negativePrompt) {
    parameters.negativePrompt = options.negativePrompt;
  }

  // Add aspect ratio
  if (options?.aspectRatio) {
    parameters.aspectRatio = options.aspectRatio;
  }

  // Add duration (validate against model's supported durations)
  if (options?.durationSeconds) {
    const validDurations = getModelDurationOptions(model);
    if (validDurations.includes(options.durationSeconds as any)) {
      parameters.durationSeconds = options.durationSeconds;
    } else {
      console.warn(
        `Duration ${options.durationSeconds} not supported by model ${model}. Using default ${MODEL_CAPABILITIES[model].defaultDuration}s.`,
      );
      parameters.durationSeconds = MODEL_CAPABILITIES[model].defaultDuration;
    }
  }

  // When using referenceImages, duration must be 8 seconds
  if (options?.referenceImages && options.referenceImages.length > 0) {
    parameters.durationSeconds = 8;
  }

  const requestBody: any = {
    instances: [instance],
  };

  // Only add parameters if we have any
  if (Object.keys(parameters).length > 0) {
    requestBody.parameters = parameters;
  }

  console.log(
    `[generateVideo] Request body:`,
    JSON.stringify(requestBody, null, 2),
  );

  const data = await makeGeminiRequest(
    env,
    `/models/${model}:predictLongRunning`,
    "POST",
    requestBody,
  );

  return OperationResponseSchema.parse(data);
}

export async function generateVideoFromImage(
  env: Env,
  prompt: string,
  imageUrl: string,
  model: VeoModel = "veo-3.1-generate-preview",
  options?: {
    personGeneration?: "dont_allow" | "allow_adult";
    negativePrompt?: string;
    aspectRatio?: "16:9" | "9:16";
    durationSeconds?: number;
    referenceType?: "asset" | "style";
  },
): Promise<OperationResponse> {
  return generateVideo(env, prompt, model, {
    ...options,
    referenceImages: [{ url: imageUrl, referenceType: options?.referenceType }],
  });
}

export async function generateVideoWithFrames(
  env: Env,
  prompt: string,
  firstFrameUrl: string,
  lastFrameUrl: string,
  model: VeoModel = "veo-3.1-generate-preview",
  options?: {
    personGeneration?: "dont_allow" | "allow_adult";
    negativePrompt?: string;
    aspectRatio?: "16:9" | "9:16";
    durationSeconds?: number;
  },
): Promise<OperationResponse> {
  if (!modelSupports(model, "supportsLastFrame")) {
    throw new Error(
      `Model ${model} does not support start/end frames (lastFrame parameter)`,
    );
  }

  return generateVideo(env, prompt, model, {
    ...options,
    firstFrameImageUrl: firstFrameUrl,
    lastFrameImageUrl: lastFrameUrl,
  });
}

export async function extendVideo(
  env: Env,
  previousOperationName: string,
  prompt: string,
  model: VeoModel = "veo-3.1-generate-preview",
): Promise<OperationResponse> {
  // First get the previous video
  const previousOperation = await getOperationStatus(
    env,
    previousOperationName,
  );

  const generatedSamples =
    previousOperation.response?.generateVideoResponse?.generatedSamples;
  if (!previousOperation.done || !generatedSamples?.[0]) {
    throw new Error(
      "Previous video operation is not completed or has no video",
    );
  }

  const previousVideo = generatedSamples[0];

  const requestBody: any = {
    instances: [
      {
        prompt,
        referenceVideo: {
          uri: previousVideo.video.uri,
        },
      },
    ],
  };

  const data = await makeGeminiRequest(
    env,
    `/models/${model}:predictLongRunning`,
    "POST",
    requestBody,
  );

  return OperationResponseSchema.parse(data);
}

export async function getOperationStatus(
  env: Env,
  operationName: string,
): Promise<OperationResponse> {
  assertEnvKey(env, "GOOGLE_GENAI_API_KEY");

  const url = `${GEMINI_API_BASE_URL}/${operationName}`;

  console.log(`[getOperationStatus] Fetching operation: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-goog-api-key": env.GOOGLE_GENAI_API_KEY as string,
    },
  });

  console.log(`[getOperationStatus] Response status: ${response.status}`);

  if (!response.ok) {
    console.error(`[getOperationStatus] Error response`);
    await parseApiError(response, "Gemini");
  }

  const data = await response.json();
  console.log(
    `[getOperationStatus] Raw API response:`,
    JSON.stringify(data, null, 2),
  );

  // Note: Fallback to Files API is no longer needed with correct schema

  return OperationResponseSchema.parse(data);
}

export async function downloadVideo(
  env: Env,
  videoUri: string,
): Promise<ReadableStream> {
  assertEnvKey(env, "GOOGLE_GENAI_API_KEY");

  console.log(`[downloadVideo] Starting stream download from URI: ${videoUri}`);

  // The URI already includes ?alt=media, so we need to append with &
  // URI format: https://generativelanguage.googleapis.com/v1beta/files/{fileId}:download?alt=media
  const separator = videoUri.includes("?") ? "&" : "?";
  const url = `${videoUri}${separator}key=${env.GOOGLE_GENAI_API_KEY as string}`;

  console.log(
    `[downloadVideo] Fetching from URL (key hidden): ${videoUri}${separator}key=***`,
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-goog-api-key": env.GOOGLE_GENAI_API_KEY as string,
    },
  });

  console.log(
    `[downloadVideo] Response status: ${response.status} ${response.statusText}`,
  );
  console.log(
    `[downloadVideo] Response headers:`,
    Object.fromEntries(response.headers.entries()),
  );

  if (!response.ok) {
    console.error(`[downloadVideo] ❌ Download failed`);
    await parseApiError(response, "Gemini");
  }

  if (!response.body) {
    throw new Error("Response body is null - cannot stream video");
  }

  console.log(`[downloadVideo] ✅ Successfully got stream`);

  return response.body;
}

export async function pollOperationUntilComplete(
  env: Env,
  operationName: string,
  maxWaitMs: number = 360000, // 6 minutes
  pollIntervalMs: number = 10000, // 10 seconds
): Promise<OperationResponse> {
  return await pollUntilComplete({
    checkFn: () => getOperationStatus(env, operationName),
    isDoneFn: (operation) => operation.done === true,
    getErrorFn: (operation) =>
      operation.error ? operation.error.message : null,
    maxWaitMs,
    pollIntervalMs,
    timeoutMessage: `Operation timed out after ${maxWaitMs}ms`,
  });
}

export const createVeoClient = (env: Env) => ({
  generateVideo: (
    prompt: string,
    model?: VeoModel,
    options?: {
      referenceImages?: Array<{
        url: string;
        referenceType?: "asset" | "style";
      }>;
      firstFrameImageUrl?: string;
      lastFrameImageUrl?: string;
      personGeneration?: "dont_allow" | "allow_adult";
      negativePrompt?: string;
      aspectRatio?: "16:9" | "9:16";
      durationSeconds?: number;
    },
  ) => generateVideo(env, prompt, model, options),

  generateVideoFromImage: (
    prompt: string,
    imageUrl: string,
    model?: VeoModel,
    options?: {
      personGeneration?: "dont_allow" | "allow_adult";
      negativePrompt?: string;
      aspectRatio?: "16:9" | "9:16";
      durationSeconds?: number;
      referenceType?: "asset" | "style";
    },
  ) => generateVideoFromImage(env, prompt, imageUrl, model, options),

  generateVideoWithFrames: (
    prompt: string,
    firstFrameUrl: string,
    lastFrameUrl: string,
    model?: VeoModel,
    options?: {
      personGeneration?: "dont_allow" | "allow_adult";
      negativePrompt?: string;
      aspectRatio?: "16:9" | "9:16";
      durationSeconds?: number;
    },
  ) =>
    generateVideoWithFrames(
      env,
      prompt,
      firstFrameUrl,
      lastFrameUrl,
      model,
      options,
    ),

  extendVideo: (
    previousOperationName: string,
    prompt: string,
    model?: VeoModel,
  ) => extendVideo(env, previousOperationName, prompt, model),

  getOperationStatus: (operationName: string) =>
    getOperationStatus(env, operationName),

  downloadVideo: (videoUri: string) => downloadVideo(env, videoUri),

  pollOperationUntilComplete: (
    operationName: string,
    maxWaitMs?: number,
    pollIntervalMs?: number,
  ) =>
    pollOperationUntilComplete(env, operationName, maxWaitMs, pollIntervalMs),

  // Helper functions
  modelSupports: (
    model: VeoModel,
    feature: keyof (typeof MODEL_CAPABILITIES)[VeoModel],
  ) => modelSupports(model, feature),

  getModelDurationOptions: (model: VeoModel) => getModelDurationOptions(model),
});
