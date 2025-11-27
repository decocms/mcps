# Audio Transcribers

Shared module for building audio transcription tools using different AI providers.

## Overview

This module provides a standardized interface for creating audio transcription tools that integrate with the Deco platform. It handles:

- Audio file fetching from URLs
- API integration with transcription services
- Contract-based billing
- Retry logic and timeout handling
- Structured logging
- Type-safe schemas

## Usage

```typescript
import { createAudioTranscriberTools } from "@decocms/mcps-shared/audio-transcribers";
import type { Env } from "./main";

export const whisperTools = createAudioTranscriberTools<Env>({
  metadata: {
    provider: "OpenAI Whisper",
    description: "Transcribe audio to text using OpenAI Whisper",
  },
  getContract: (env) => ({
    binding: env.WHISPER_CONTRACT,
    clause: {
      clauseId: "whisper-1:transcribeAudio",
      amount: 1,
    },
  }),
  execute: async ({ env, input }) => {
    // Your transcription logic here
    const client = createWhisperClient(env);
    const response = await client.transcribeAudio(input.audioUrl);
    
    return {
      text: response.text,
      language: response.language,
      duration: response.duration,
    };
  },
});
```

## Input Schema

```typescript
{
  audioUrl: string;           // URL of the audio file to transcribe
  language?: string;          // Language code (e.g., 'en', 'pt', 'es')
  prompt?: string;            // Optional prompt to guide transcription
  responseFormat?: string;    // 'json', 'text', 'srt', 'verbose_json', 'vtt'
  temperature?: number;       // Sampling temperature (0-1)
  timestampGranularities?: Array<'word' | 'segment'>; // For detailed timing
}
```

## Output Schema

```typescript
{
  text?: string;              // The transcribed text
  language?: string;          // Detected language
  duration?: number;          // Audio duration in seconds
  segments?: Array<{          // Segments with timestamps
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{             // Individual words with timestamps
    word: string;
    start: number;
    end: number;
  }>;
  error?: boolean;            // Whether the request failed
  finishReason?: string;      // Native finish reason if failed
}
```

## Features

### Automatic Retry
Failed transcriptions are automatically retried up to 3 times with exponential backoff.

### Timeout Protection
Transcriptions that take longer than 5 minutes are automatically cancelled.

### Contract-Based Billing
Integrates with Deco's contract system for usage tracking and billing.

### Structured Logging
All operations are logged with timestamps and context for debugging.

## Supported Providers

- **OpenAI Whisper** - Speech-to-text transcription with multi-language support

## Adding a New Provider

1. Create a new directory for your provider (e.g., `my-transcriber/`)
2. Implement the client utilities in `server/tools/utils/`
3. Use `createAudioTranscriberTools` in your main tool file
4. Export the tools from `server/tools/index.ts`

## Error Handling

The module provides standardized error handling:

```typescript
{
  error: true,
  finishReason: "api_error" | "timeout" | "invalid_audio" | string
}
```

## Best Practices

1. **Always validate audio URLs** before passing them to the API
2. **Use language hints** when you know the audio language for better accuracy
3. **Request timestamps** only when needed (they increase processing time)
4. **Set appropriate temperature** - lower (0-0.3) for factual content, higher (0.7-1.0) for creative content
5. **Handle errors gracefully** - audio transcription can fail for various reasons

## Configuration

### Timeouts
- Default: 5 minutes
- Configurable in `base.ts`: `MAX_TRANSCRIPTION_TIMEOUT_MS`

### Retries
- Default: 3 attempts
- Configurable in `base.ts`: `MAX_TRANSCRIPTION_RETRIES`

## License

MIT

