# Nano Banana MCP 

## Description

**Nano Banana MCP** is a Model Context Protocol (MCP) server for AI-powered image generation using Google Gemini models via OpenRouter.

### Features

- 🎨 **AI Image Generation**: Text-to-image generation with detailed prompts
- 🖼️ **Image Editing**: Modify existing images using natural language instructions
- 🤖 **Multiple Models**: Support for Gemini 2.0 Flash, 2.5 Flash, and 2.5 Pro
- 📐 **Aspect Ratios**: Flexible output dimensions (1:1, 16:9, 9:16, etc.)
- 💰 **Contract Management**: Built-in authorization and billing
- 💾 **File Storage**: Automatic image storage via file system binding

## Setup

### Prerequisites

- Node.js >= 22.0.0
- Bun (package manager)

### Installation

```bash
cd nanobanana
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Type Check

```bash
bun run check
```

## Configuration

### State Schema

The MCP requires the following configuration:

| Field | Type | Description |
|-------|------|-------------|
| `NANOBANANA_CONTRACT` | Binding | Contract binding for authorization and billing |
| `FILE_SYSTEM` | Binding | File system binding for storing generated images |
| `NANOBANANA_API_KEY` | string | OpenRouter API key for accessing Gemini models |

## Tools

### GENERATE_IMAGE

Generate an image using Gemini models via OpenRouter.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Text description of the image to generate |
| `baseImageUrl` | string | ❌ | URL of an existing image for image-to-image generation (single image) |
| `baseImageUrls` | string[] | ❌ | Array of image URLs for multi-image generation (e.g., virtual try-on). Takes precedence over `baseImageUrl` |
| `aspectRatio` | enum | ❌ | Output aspect ratio (1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9) |
| `model` | enum | ❌ | Model to use (gemini-2.0-flash-exp, gemini-2.5-pro-image-preview, gemini-2.5-pro-exp-03-25, gemini-3-pro-image-preview, gemini-3.1-flash-image-preview) |

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `image` | string | URL of the generated image |
| `error` | boolean | Whether the request failed |
| `finishReason` | string | Native finish reason from the model |

### Examples

**Text-to-Image:**

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "An orange cat sitting on a blue chair, cartoon style"
});
```

**With Aspect Ratio:**

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Mountain landscape at sunset",
  aspectRatio: "16:9"
});
```

**Image-to-Image (Single):**

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Add snow on the mountains",
  baseImageUrl: "https://example.com/landscape.jpg"
});
```

**Multi-Image Generation (Virtual Try-On):**

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Virtual try-on: person wearing the garment from the second image",
  baseImageUrls: [
    "https://example.com/person.jpg",      // First image: person photo
    "https://example.com/t-shirt.jpg"      // Second image: garment
  ],
  aspectRatio: "3:4"
});
```

**Specific Model:**

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "A futuristic city",
  model: "gemini-2.5-pro-exp-03-25"
});
```

## Project Structure

```
nanobanana/
├── app.json                 # Store metadata for publishing
├── server/
│   ├── main.ts              # Entry point with runtime configuration
│   ├── constants.ts         # API base URLs
│   ├── types/
│   │   └── env.ts           # StateSchema and Env type definition
│   └── tools/
│       ├── index.ts         # Export all tools
│       ├── gemini.ts        # Image generation tool
│       └── utils/
│           └── gemini.ts    # OpenRouter/Gemini API client
├── package.json
├── tsconfig.json
└── README.md
```

## Supported Models

| Model | Description |
|-------|-------------|
| `gemini-2.0-flash-exp` | Gemini 2.0 Flash experimental with image generation |
| `gemini-2.5-pro-image-preview` | Gemini 2.5 Pro optimized for image generation |
| `gemini-3-pro-image-preview` | Gemini 3 Pro with advanced image generation |
| `gemini-3.1-flash-image-preview` | **Gemini 3.1 Flash for image generation (default)** ✅ |
| `gemini-2.5-pro-exp-03-25` | Gemini 2.5 Pro experimental with enhanced image quality |

## Technologies

- **Runtime**: Bun
- **MCP Framework**: Deco Workers Runtime
- **API Provider**: OpenRouter
- **Validation**: Zod
- **Language**: TypeScript
