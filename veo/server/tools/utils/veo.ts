import { GEMINI_API_BASE_URL } from "../../constants";
import { Env } from "server/main";
import z from "zod";

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
    .union([
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
    ])
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

/**
 * Assert that the Google Gemini API key is set
 */
function assertApiKey(env: Env) {
  if (!env.GOOGLE_GENAI_API_KEY) {
    throw new Error("GOOGLE_GENAI_API_KEY is not set in environment");
  }
}

/**
 * Fetch image from URL and convert to base64
 * Supports both HTTP URLs and data URLs
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  console.log(
    `[fetchImageAsBase64] Fetching image from: ${imageUrl.substring(0, 100)}...`,
  );

  // If it's already a data URL, extract the base64 part
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        mimeType: match[1],
        base64: match[2],
      };
    }
    throw new Error("Invalid data URL format");
  }

  // Fetch the image from HTTP(S) URL
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  // Get the content type
  const contentType = response.headers.get("content-type") || "image/jpeg";

  // Convert to base64
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert bytes to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  console.log(
    `[fetchImageAsBase64] Successfully converted ${bytes.length} bytes to base64 (${contentType})`,
  );

  return {
    base64,
    mimeType: contentType,
  };
}

/**
 * Make a request to the Gemini API
 */
async function makeGeminiRequest(
  env: Env,
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: any,
): Promise<any> {
  assertApiKey(env);

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

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();

    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  return await response.json();
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

/**
 * Generate a video from an image reference
 */
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

/**
 * Generate a video with start and end frames
 * Creates a transition between two images
 */
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

/**
 * Extend a previously generated video
 */
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

/**
 * Get the status of a video generation operation
 */
export async function getOperationStatus(
  env: Env,
  operationName: string,
): Promise<OperationResponse> {
  assertApiKey(env);

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
    const errorText = await response.text();
    console.error(`[getOperationStatus] Error response:`, errorText);

    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  const data = await response.json();
  console.log(
    `[getOperationStatus] Raw API response:`,
    JSON.stringify(data, null, 2),
  );

  // Note: Fallback to Files API is no longer needed with correct schema

  return OperationResponseSchema.parse(data);
}

/**
 * Download video content from Gemini
 */
export async function downloadVideo(
  env: Env,
  videoUri: string,
): Promise<ReadableStream> {
  assertApiKey(env);

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
    const errorText = await response.text();
    console.error(`[downloadVideo] ❌ Download failed: ${errorText}`);
    throw new Error(
      `Failed to download video: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  if (!response.body) {
    throw new Error("Response body is null - cannot stream video");
  }

  console.log(`[downloadVideo] ✅ Successfully got stream`);

  return response.body;
}

/**
 * Poll an operation until it's complete or timeout
 */
export async function pollOperationUntilComplete(
  env: Env,
  operationName: string,
  maxWaitMs: number = 360000, // 6 minutes
  pollIntervalMs: number = 10000, // 10 seconds
): Promise<OperationResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const operation = await getOperationStatus(env, operationName);

    if (operation.done) {
      return operation;
    }

    if (operation.error) {
      throw new Error(`Operation failed: ${operation.error.message}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Operation timed out after ${maxWaitMs}ms`);
}

/**
 * Convenience function to create Veo client
 */
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
