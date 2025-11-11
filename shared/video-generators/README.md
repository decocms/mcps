# Video Generators

Reusable library for creating MCP bindings for video generation. Similar to `image-generators`, but adapted for video operations.

## Features

- 🎬 Support for text-to-video generation
- 🖼️ Image-to-video generation
- 🎨 Support for multiple reference images
- 🎞️ Control of initial and final frames
- ⚡ Middlewares for retry, logging and timeout
- 💾 Integrated storage system with **streaming support** for memory efficiency
- 💰 Contract and billing system
- 🔄 Support for long-running operations
- 🌊 **Stream-based uploads** - handle videos of any size without RAM limits

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
    // Implement video generation logic
    // This function should return the generated video
    const videoBlob = await generateVideoSomehow(input);
    
    return {
      data: videoBlob,
      mimeType: "video/mp4",
      operationName: "optional-operation-id",
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

- `16:9` - Widescreen (default)
- `9:16` - Vertical (mobile)
- `1:1` - Square
- `4:3` - Classic
- `3:4` - Classic vertical

## Supported Durations

- 4 seconds
- 5 seconds
- 6 seconds
- 7 seconds
- 8 seconds (default)

> Note: Not all models support all durations. Check the specific model's capabilities.

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

For operations that take longer:

1. Start generation and return an `operationName`
2. Use polling to check status
3. When complete, download and save the video

```typescript
execute: async ({ env, input }) => {
  // Start operation
  const operation = await startVideoGeneration(input);
  
  // Wait for completion
  const completed = await pollUntilComplete(operation.name);
  
  // Download
  const videoBlob = await downloadVideo(completed.videoUri);
  
  return {
    data: videoBlob,
    mimeType: "video/mp4",
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
import { 
  generateVideo, 
  pollOperationUntilComplete,
  downloadVideo 
} from "./veo-client";

const tools = createVideoGeneratorTools({
  metadata: {
    provider: "Google Veo",
    description: "Generate videos using Google's Veo model",
  },
  execute: async ({ env, input }) => {
    // Start generation
    const operation = await generateVideo(env, input.prompt, "veo-3.1-generate-preview", {
      aspectRatio: input.aspectRatio,
      durationSeconds: input.duration,
      referenceImages: input.referenceImages,
      firstFrameImageUrl: input.firstFrameUrl,
      lastFrameImageUrl: input.lastFrameUrl,
      personGeneration: input.personGeneration,
      negativePrompt: input.negativePrompt,
    });

    // Wait for completion (with polling)
    const completed = await pollOperationUntilComplete(
      env, 
      operation.name,
      360000, // 6 minutes
      10000,  // poll every 10 seconds
    );

    if (!completed.done || !completed.response?.generateVideoResponse) {
      return {
        error: true,
        finishReason: "operation_not_completed",
      };
    }

    // Download the video
    const video = completed.response.generateVideoResponse.generatedSamples[0];
    const videoBlob = await downloadVideo(env, video.video.uri);

    return {
      data: videoBlob,
      mimeType: "video/mp4",
      operationName: operation.name,
    };
  },
  getStorage: (env) => env.STORAGE,
  getContract: (env) => ({
    binding: env.CONTRACT,
    clause: {
      clauseId: "veo_video_generation",
      amount: 200, // Videos cost more than images
    },
  }),
});
```

## Differences from image-generators

1. **Longer timeout**: 6 minutes vs 2 minutes
2. **Data types**: Blob/ArrayBuffer vs base64 string
3. **Input schema**: Support for video-specific features (duration, frames)
4. **Async operations**: Better support for long-running operations
5. **Storage**: Optimized for larger files

## Streaming Support

For memory efficiency, the framework supports streaming video data directly from source to storage:

```typescript
execute: async ({ env, input }) => {
  // Download video as stream (memory efficient!)
  const videoStream = await downloadVideoAsStream(url);
  
  return {
    data: videoStream,  // ✅ ReadableStream - doesn't load into RAM
    mimeType: "video/mp4",
  };
}
```

**Benefits:**
- ✅ Handle videos of any size (100MB, 500MB, 1GB+)
- ✅ Constant memory usage (~5-10MB regardless of video size)
- ✅ Faster processing (no intermediate buffering)
- ✅ Worker-friendly (no RAM limits)

See [STREAMING.md](./STREAMING.md) for detailed documentation.

## Additional Features

- Image-to-video support
- Multiple reference images
- Control of initial and final frames
- Video extension capabilities
- Person generation control
- Negative prompts for better control
- **Stream-based processing** for large files

