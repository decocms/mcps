# Gemini Nano Banana MCP

## Project Description

**Gemini Nano Banana MCP** is a Model Context Protocol (MCP) server that integrates the Gemini 2.5 Flash Image Preview and nanoBanana Pro API for text-to-image generation. This project is hosted as a Cloudflare Workers application.

### Purpose

This MCP server allows client applications to:
- Generate images from text prompts using the Gemini model
- Use base images for modifications and variations
- Customize image aspect ratios
- Store and access generated images through a file system
- Manage authorization and payments through the NanoBanana Contract system

### Key Features

- 🎨 **AI Image Generation**: Full integration with Gemini 2.5 Flash Image Preview
- 🔄 **Retry System**: Automatic retry on failure (up to 3 attempts)
- 📝 **Detailed Logging**: Records all generation operations
- 💰 **Contract Management**: Integrated authorization and payment system
- 💾 **Persistent Storage**: File system for saving generated images
- 🖼️ **Base Image Support**: Modification of existing images
- 📐 **Customizable Aspect Ratios**: Control over image proportions
- 👤 **User Tools**: User information management

## Setup / Installation

### Prerequisites

- Node.js >= 22.0.0
- Bun (package manager)
- Cloudflare account (for deployment)
- Gemini API access

### Local Installation

1. Clone the repository:
```bash
cd gemini-nano-banana
```

2. Install dependencies:
```bash
bun install
```

3. Configure required environment variables:
```bash
bun run configure
```

4. Generate TypeScript types:
```bash
bun run gen
```

5. Start the development server:
```bash
bun run dev
```

The server will be available at `http://localhost:8787` (default Cloudflare Workers port).

### Production Build

```bash
bun run build
```

### Deployment

```bash
bun run deploy
```

## Usage Examples

### Generating a Simple Image

```typescript
// MCP Client
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "An orange cat sitting on a blue chair, cartoon style"
});

// Result
{
  image: "https://...", // Generated image URL
  finishReason: "STOP"
}
```

### Generating with Specific Aspect Ratio

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Mountain landscape at sunset",
  aspectRatio: "16:9"
});
```

### Modifying an Existing Image

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Add snow on the mountains",
  baseImageUrl: "https://example.com/landscape.jpg"
});
```

### Error Handling

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Generate an image..."
});

if (result.error) {
  console.error("Generation failed:", result.finishReason);
  // Possible reasons: SAFETY, MAX_TOKENS, RECITATION, etc.
}
```

## Configuration Details

### File Structure

```
gemini-nano-banana/
├── server/              # MCP server code
│   ├── main.ts         # Main entry point
│   ├── tools/          # MCP tools
│   │   ├── index.ts    # Tools aggregator
│   │   ├── gemini.ts   # Image generation tool
│   │   └── utils/      # Utilities
│   │       └── gemini.ts # Gemini client
│   └── views.ts        # Views configuration
└── shared/             # Shared code
    └── deco.gen.ts    # Generated types
```

### Environment Variables / Bindings

The project uses the following Cloudflare Workers bindings:

#### `NANOBANANA_CONTRACT`
Authorization and payment system for API usage:
- `CONTRACT_AUTHORIZE`: Authorizes a transaction before generation
- `CONTRACT_SETTLE`: Finalizes the transaction after generation

#### `FILE_SYSTEM`
Image storage system:
- `FS_READ`: Reads files from the file system
- `FS_WRITE`: Writes files to the file system

### OAuth Configuration

The project supports OAuth for authentication. Configure required scopes in `server/main.ts`:

```typescript
oauth: {
  scopes: [], // Add scopes as needed
  state: StateSchema,
}
```

### State Schema

The State Schema defines the installed application state. You can extend it to add custom fields such as API keys:

```typescript
state: StateSchema.extend({
  geminiApiKey: z.string().optional(),
  // other fields...
})
```

### Available Scripts

- `bun run dev` - Starts development server with hot reload
- `bun run configure` - Configures the Deco project
- `bun run gen` - Generates TypeScript types
- `bun run build` - Compiles for production
- `bun run deploy` - Deploys to Cloudflare Workers
- `bun run check` - Type checks TypeScript without compiling

### Image Generation Middlewares

The system uses `withContractManagement` which automatically includes:

1. **Contract Management**: Manages authorization and payment (inner layer)
2. **Logging Middleware**: Records start and end of operations
3. **Retry Middleware**: Retries on failure (max 3x, outer layer)

```typescript
const executeWithMiddlewares = withContractManagement(executeGeneration, {
  clauseId: "gemini-2.5-flash-image-preview:generateContent",
  contract: "NANOBANANA_CONTRACT",
  provider: "Gemini",
  maxRetries: 3,
});
```

**Advantages**: No need to manually compose `withRetry` and `withLogging` - everything is included!

### Input/Output Format

#### Input (`GenerateImageInput`)
```typescript
{
  prompt: string;              // Description of the desired image
  baseImageUrl?: string;       // Base image URL (optional)
  aspectRatio?: string;        // Ratio (e.g., "16:9", "1:1")
}
```

#### Output (`GenerateImageOutput`)
```typescript
// Success
{
  image: string;               // Generated image URL
  finishReason?: string;       // Completion reason
}

// Error
{
  error: true;
  finishReason?: string;       // Failure reason
}
```

### Endpoints

- `/mcp` - MCP server endpoint
- All other requests fallback to static assets

## Technologies Used

- **Runtime**: Cloudflare Workers
- **MCP Framework**: Deco Workers Runtime
- **Build Tool**: Vite
- **Validation**: Zod
- **Language**: TypeScript

## License

