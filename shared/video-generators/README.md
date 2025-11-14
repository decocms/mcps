# Video Generators

Reusable library for creating MCP bindings for video generation. Similar to `image-generators`, but adapted for video operations.

## Features

- 🎬 Support for text-to-video generation
- 🖼️ Image-to-video generation
- 🎨 Support for multiple reference images
- 🎞️ Control of initial and final frames
- ⚡ Middlewares for retry, logging and timeout
- 💾 **Streaming-first design** - videos are streamed, never loaded into memory
- 🌊 **Handle videos of any size** - no RAM limits thanks to ReadableStream
- 💰 Contract and billing system
- 🔄 Support for long-running operations
- 🔌 Multiple model support with different capabilities

## Basic Usage

```typescript
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";

// Create video generation tools
const tools = createVideoGeneratorTools({
  metadata: {
    provider: "Veo",
    description: "Generate videos using Google Veo",
  },
  execute: async ({ env, input }) => {
    // Start video generation (returns operation)
    const operation = await startVideoGeneration(env, input);
    
    // Wait for completion
    const completed = await pollOperation(env, operation.name);
    
    // Download as stream (memory efficient - no blob in RAM!)
    const videoStream = await downloadVideoAsStream(env, completed.videoUri);
    
    return {
      data: videoStream, // ✅ ReadableStream - streams directly to storage
      mimeType: "video/mp4",
      operationName: operation.name,
    };
  },
  getStorage: (env) => env.STORAGE,
  getContract: (env) => ({
    binding: env.CONTRACT,
    clause: {
      clauseId: "video_generation",
      amount: 100, // Cost in credits
    },
  }),
});

// Use the tools
const [generateVideo] = tools.map(tool => tool(env));
```

## Input Schema

```typescript
{
  prompt: string;                    // Video description
  baseImageUrl?: string;             // Base image (image-to-video)
  referenceImages?: Array<{          // Up to 3 reference images
    url: string;
    referenceType?: "asset" | "style";
  }>;
  firstFrameUrl?: string;            // Initial frame
  lastFrameUrl?: string;             // Final frame
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  duration?: 4 | 5 | 6 | 7 | 8;      // Duration in seconds
  personGeneration?: "dont_allow" | "allow_adult";
  negativePrompt?: string;           // What to avoid
}
```

## Output Schema

```typescript
{
  video?: string;         // URL of the generated video
  error?: boolean;        // Whether there was an error
  finishReason?: string;  // Reason for completion
  operationName?: string; // Operation name for tracking
}
```

## Supported Aspect Ratios

Support varies by model. The framework accepts:

- `16:9` - Widescreen (default, widely supported)
- `9:16` - Vertical (mobile, widely supported)
- `1:1` - Square
- `4:3` - Classic
- `3:4` - Classic vertical

> **Note:** Most video generation models only support `16:9` and `9:16`. Other ratios may be automatically converted.

## Supported Durations

Support varies by model. Common options:

- **4 seconds** - Quick previews (Veo 3.x)
- **5 seconds** - Short clips (Veo 2.x)
- **6 seconds** - Standard (most models)
- **7 seconds** - Extended (Veo 2.x)
- **8 seconds** - Full length (default, most models)

> **Note:** Each model has specific duration capabilities. For example:
> - Veo 3.x models: 4, 6, 8 seconds
> - Veo 2.x models: 5, 6, 7, 8 seconds

## Model Capabilities (Veo Example)

Different models support different features. Here's a comparison:

| Model | Reference Images | Last Frame | Audio | Durations |
|-------|-----------------|------------|-------|-----------|
| `veo-3.1-generate-preview` | ✅ | ✅ | ✅ | 4, 6, 8s |
| `veo-3.1-fast-generate-preview` | ❌ | ✅ | ✅ | 4, 6, 8s |
| `veo-3.0-generate-001` | ❌ | ❌ | ✅ | 4, 6, 8s |
| `veo-3.0-fast-generate-001` | ❌ | ❌ | ✅ | 4, 6, 8s |
| `veo-3.0-generate-exp` | ❌ | ✅ | ✅ | 4, 6, 8s |
| `veo-2.0-generate-001` | ❌ | ✅ | ❌ | 5, 6, 7, 8s |
| `veo-2.0-generate-exp` | ✅ | ✅ | ❌ | 5, 6, 7, 8s |

> **Note:** When using reference images with Veo, duration is automatically set to 8 seconds.

## Middlewares

### withRetry

Retries on failure with exponential backoff.

```typescript
withRetry(maxRetries: number = 3)
```

### withLogging

Adds automatic logging with timing metrics.

```typescript
withLogging({
  title: string;
  startMessage?: string;
})
```

### withTimeout

Sets a timeout for the operation.

```typescript
withTimeout(timeoutMs: number)
```

## Storage

The `saveVideo` function saves the generated video to the configured storage:

```typescript
await saveVideo(storage, {
  videoData: blob,              // Blob or ArrayBuffer
  mimeType: "video/mp4",
  metadata: {
    prompt: "...",
    operationName: "...",
  },
  directory: "/videos",         // Target directory
  readExpiresIn: 3600,          // Read URL expiration time
  writeExpiresIn: 300,          // Write URL expiration time
  fileName: "custom-name",      // File name (optional)
});
```

## Contracts and Billing

The system automatically manages:

1. **Authorization**: Before generation, checks credits
2. **Execution**: Generates the video
3. **Settlement**: Deducts credits after success

```typescript
getContract: (env) => ({
  binding: env.CONTRACT,
  clause: {
    clauseId: "video_generation",
    amount: 100, // Cost in credits
  },
})
```

## Long-Running Operations

Video generation often takes several minutes. The framework handles this with polling:

1. Start generation and get an `operationName`
2. Poll for completion status (every 10 seconds by default)
3. When complete, stream the video directly to storage

```typescript
execute: async ({ env, input }) => {
  const client = createVeoClient(env);
  
  // Start operation (returns immediately with operation name)
  const operation = await client.generateVideo(input.prompt, "veo-3.1-generate-preview", {
    aspectRatio: input.aspectRatio,
    durationSeconds: input.duration,
  });
  
  // Wait for completion (with automatic polling)
  const completed = await client.pollOperationUntilComplete(
    operation.name,
    360000, // 6 minutes max
    10000,  // poll every 10 seconds
  );
  
  // Stream video (no blob in memory!)
  const video = completed.response.generateVideoResponse.generatedSamples[0];
  const videoStream = await client.downloadVideo(video.video.uri);
  
  return {
    data: videoStream, // ✅ Streams directly to storage
    mimeType: video.video.mimeType || "video/mp4",
    operationName: operation.name,
  };
}
```

## Timeouts

Default timeouts are:

- **Video generation**: 6 minutes (360,000ms)
- **Retries**: 3 attempts
- **Delay between retries**: Exponential backoff (2s, 4s, 8s)

Videos typically take longer than images, so timeouts are larger.

## Complete Example with Veo

```typescript
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";
import { createVeoClient } from "./veo-client";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

const tools = createVideoGeneratorTools({
  metadata: {
    provider: "Google Veo",
    description: "Generate videos using Google's Veo model",
  },
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
      360000, // 6 minutes
      10000,  // poll every 10 seconds
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

    // Download video as stream (memory efficient!)
    const video = generatedSamples[0];
    const videoStream = await client.downloadVideo(video.video.uri);

    return {
      data: videoStream, // ✅ ReadableStream - no blob in memory!
      mimeType: video.video.mimeType || "video/mp4",
      operationName: operation.name,
    };
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.VEO3_CONTRACT,
    clause: {
      clauseId: "veo-3:generateVideo",
      amount: 1,
    },
  }),
});
```

## Differences from image-generators

1. **Streaming-first**: Uses `ReadableStream` instead of loading data into memory
2. **Longer timeout**: 6 minutes vs 2 minutes (videos take longer to generate)
3. **Data types**: `ReadableStream` (preferred), `Blob`, or `ArrayBuffer` vs base64 string
4. **Input schema**: Support for video-specific features (duration, frames, reference images)
5. **Memory efficient**: Can handle videos of any size without RAM limits
6. **Async operations**: Better support for long-running operations with polling

## Streaming Support (Default Behavior)

**The framework uses streaming by default** - videos flow directly from source to storage without loading into memory:

```typescript
execute: async ({ env, input }) => {
  // Download video as stream (this is the recommended approach!)
  const videoStream = await downloadVideoAsStream(url);
  
  return {
    data: videoStream,  // ✅ ReadableStream - streams directly to storage
    mimeType: "video/mp4",
  };
}
```

**Why streaming is the default:**
- ✅ **Any size**: Handle 100MB, 500MB, 1GB+ videos without issues
- ✅ **Constant memory**: ~5-10MB usage regardless of video size
- ✅ **Faster**: No intermediate buffering or loading into RAM
- ✅ **Worker-friendly**: No memory limits or timeouts
- ✅ **Production-ready**: Designed for real-world video processing

**Legacy support:** While `Blob` and `ArrayBuffer` are still supported, they load the entire video into memory and should only be used for small videos or specific use cases.

## Additional Features

- 🖼️ **Image-to-video**: Generate videos from static images
- 🎨 **Multiple reference images**: Up to 3 reference images to guide style/assets
- 🎞️ **Frame control**: Specify exact first and last frames for transitions
- 🔗 **Video extension**: Extend existing videos with new content
- 👤 **Person generation**: Control whether people appear in videos
- 🚫 **Negative prompts**: Fine-tune output by specifying what to avoid
- 🌊 **Stream-based processing**: Default behavior for handling videos of any size

