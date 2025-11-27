# Whisper MCP

MCP (Model Context Protocol) server for audio transcription using OpenAI Whisper.

## Overview

This MCP server provides audio transcription capabilities using OpenAI's Whisper API. It supports multiple languages, detailed timestamps, and various output formats.

## Features

- 🎙️ **Audio Transcription** - Convert audio to text with high accuracy
- 🌍 **Multi-language** - Supports 90+ languages or automatic detection
- ⏱️ **Timestamps** - Detailed timestamps per word or segment
- 📝 **Multiple Formats** - JSON, text, SRT, VTT, or verbose JSON
- 🔄 **Auto-retry** - Automatic retry with exponential backoff
- 📊 **Logging** - Structured logging for debugging

## Supported Audio Formats

- FLAC
- M4A
- MP3
- MP4
- MPEG
- MPGA
- OGA
- OGG
- WAV
- WEBM

**Size limit:** 25 MB per file

## Installation

```bash
cd whisper
bun install
```

## Configuration

### Environment Variables

Configure the following environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Local Development

```bash
bun run dev
```

### Production Build

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Usage

### Tool: TRANSCRIBE_AUDIO

Transcribes an audio file to text.

#### Input Parameters

```typescript
{
  audioUrl: string;                          // Audio file URL
  language?: string;                         // Language code (e.g., 'pt', 'en', 'es')
  prompt?: string;                           // Optional prompt to guide transcription
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
  temperature?: number;                      // Sampling temperature (0-1)
  timestampGranularities?: Array<"word" | "segment">;  // For detailed timestamps
}
```

#### Response

```typescript
{
  text?: string;                             // Transcribed text
  language?: string;                         // Detected language
  duration?: number;                         // Duration in seconds
  segments?: Array<{                         // Segments with timestamps
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{                            // Individual words with timestamps
    word: string;
    start: number;
    end: number;
  }>;
  error?: boolean;                           // Whether the request failed
  finishReason?: string;                     // Failure reason
}
```

### Examples

#### Basic Transcription

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio.mp3"
});

console.log(result.text);
```

#### Transcription with Specific Language

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio-pt.mp3",
  language: "pt"
});
```

#### Transcription with Timestamps

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio.mp3",
  timestampGranularities: ["word", "segment"]
});

// Access word-level timestamps
result.words?.forEach(word => {
  console.log(`${word.word} (${word.start}s - ${word.end}s)`);
});

// Access segment-level timestamps
result.segments?.forEach(segment => {
  console.log(`${segment.text} (${segment.start}s - ${segment.end}s)`);
});
```

#### Transcription with Contextual Prompt

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/technical-talk.mp3",
  prompt: "This is a technical presentation about machine learning and AI.",
  language: "en"
});
```

## Architecture

This project follows the DRY (Don't Repeat Yourself) pattern and uses shared code:

```
whisper/
├── server/
│   ├── main.ts                    # MCP server entry point
│   ├── constants.ts               # API configuration
│   └── tools/
│       ├── index.ts               # Tools export
│       ├── whisper.ts             # Main transcription tool
│       └── utils/
│           └── whisper.ts         # Whisper client and utilities
├── shared/
│   └── deco.gen.ts               # Auto-generated types
└── README.md                     # This file

shared/ (shared code)
└── audio-transcribers/
    ├── base.ts                   # Base abstraction for transcribers
    ├── index.ts                  # Exports
    └── README.md                 # Shared module documentation
```

## Contract Configuration

⚠️ **Note:** This project uses a mock contract for development. When `WHISPER_CONTRACT` is configured on the Deco platform, update:

1. `server/main.ts` - Uncomment contract scopes
2. `server/tools/whisper.ts` - Remove mock and use `env.WHISPER_CONTRACT`

## Best Practices

### Language Detection

- For best results, specify the language if you know it
- Automatic detection works well but may add latency

### Temperature

- Use low values (0-0.3) for factual/technical content
- Use high values (0.7-1.0) for creative content

### Timestamps

- Word-level timestamps increase processing time
- Use only when needed for precise synchronization

### File Size

- Files larger than 25 MB need to be split
- Consider pre-processing audio to reduce size (lower bitrate, lower sample rate)

### Performance

- Whisper API is asynchronous - no polling needed
- Default timeout: 5 minutes
- Automatic retry: 3 attempts

## Troubleshooting

### Error: "Cannot find module '@decocms/mcps-shared/audio-transcribers'"

Run:
```bash
bun install
```

### Error: "OPENAI_API_KEY is not set"

Configure the environment variable:
```bash
export OPENAI_API_KEY=your_key_here
```

### Error: "Failed to fetch audio file"

- Check if the audio URL is accessible
- Make sure the audio format is supported
- Verify the file doesn't exceed 25 MB

## Development

### Check Types

```bash
bun run check
```

### Generate Types

```bash
bun run gen
```

### Configure

```bash
bun run configure
```

## Additional Resources

- [Whisper API Documentation](https://platform.openai.com/docs/api-reference/audio)
- [MCP Shared README](../shared/audio-transcribers/README.md)
- [Deco Runtime Documentation](https://github.com/decocms/runtime)

## License

MIT

