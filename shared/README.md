# @decocms/mcps-shared

Shared package of utilities, tools and helpers for creating MCPs (Model Context Protocol servers) on the Deco platform.

## Available Modules

### 1. User Tools (`/tools/user`)

Common authentication and user management tools.

#### Usage

```typescript
import { userTools } from "@decocms/mcps-shared/tools/user";
import type { UserToolsEnv } from "@decocms/mcps-shared/tools/user";

// Your Env must extend UserToolsEnv
export type Env = UserToolsEnv & {
  // Your specific variables...
};

// Use the shared tools
export const tools = [...userTools];
```

#### Included Tools

- `GET_USER` - Returns authenticated user information

### 2. Image Generators System (`/image-generators`)

Framework for creating image generation tools that follow a standard contract, making it easier to create MCPs for different AI providers (Gemini, DALL-E, Midjourney, Stable Diffusion, etc).

#### Basic Usage

```typescript
import {
  createImageGeneratorTool,
  withContractManagement,
  saveImageToFileSystem,
  type GenerateImageInput,
  type GenerateImageOutput,
} from "@decocms/mcps-shared/image-generators";

export const generateImage = (env: Env) => {
  const executeGeneration = async (
    input: GenerateImageInput,
    env: Env
  ): Promise<GenerateImageOutput> => {
    // Call your provider's API
    const response = await callProviderAPI(input.prompt, input.aspectRatio);
    
    // Save the image
    const { url } = await saveImageToFileSystem(env, {
      imageData: response.imageData,
      mimeType: "image/png",
      metadata: { prompt: input.prompt },
    });
    
    return { image: url };
  };

  return createImageGeneratorTool(env, {
    id: "GENERATE_IMAGE",
    provider: "Your Provider",
    execute: withContractManagement(executeGeneration, {
      clauseId: "provider:generateImage",
      contract: "YOUR_CONTRACT",
      provider: "Provider",
    }),
  });
};
```

#### Standard Schema

All image generators follow the same contract:

**Input:**
- `prompt` (string, required) - Description of the image to be generated
- `baseImageUrl` (string, optional) - URL of a base image for image-to-image
- `aspectRatio` (enum, optional) - Aspect ratio: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"

**Output:**
- `image` (string, optional) - URL of the generated image
- `error` (boolean, optional) - Whether there was an error in generation
- `finishReason` (string, optional) - Reason for completion (success, content filter, etc)

#### Available Middlewares

##### `withRetry(fn, maxRetries?)`

Adds automatic retry logic with exponential backoff.

```typescript
const resilientGeneration = withRetry(executeGeneration, 3);
```

##### `withLogging(fn, providerName)`

Adds performance and error logging.

```typescript
const loggedGeneration = withLogging(executeGeneration, "Gemini");
```

##### `withTimeout(fn, timeoutMs)`

Adds timeout to prevent very long executions.

```typescript
const timedGeneration = withTimeout(executeGeneration, 60000); // 60 seconds
```

##### `withContractManagement(fn, options)`

Adds contract authorization and settlement for billing, plus **automatically includes retry and logging**.

Options:
- `clauseId` (required) - Contract clause ID
- `contract` (required) - Contract property name in environment
- `provider` (optional) - Provider name for logs (default: "Provider")
- `maxRetries` (optional) - Maximum number of attempts (default: 3)

```typescript
const billedGeneration = withContractManagement(executeGeneration, {
  clauseId: "gemini-2.5-flash-image-preview:generateContent",
  contract: "NANOBANANA_CONTRACT",
  provider: "Gemini",
  maxRetries: 3,
});
```

#### Storage Utilities

##### `saveImageToFileSystem(env, options)`

Saves a base64 image to the file system.

```typescript
const { url, path } = await saveImageToFileSystem(env, {
  imageData: "data:image/png;base64,...",
  mimeType: "image/png",
  metadata: { prompt: "a beautiful sunset" },
  directory: "/images", // optional
});
```

##### `extractImageData(inlineData)`

Extracts MIME type and data from an inline_data object.

```typescript
const { mimeType, imageData } = extractImageData(response.inline_data);
```

#### Middleware Composition

`withContractManagement` already includes retry and logging automatically. If you need to add timeout or other middlewares:

```typescript
const robustExecute = withTimeout(
  withContractManagement(executeGeneration, {
    clauseId: "gemini:generateImage",
    contract: "NANOBANANA_CONTRACT",
    provider: "Gemini",
    maxRetries: 3,
  }),
  60000
);
```

## Complete Example: Gemini Image Generator MCP

```typescript
// gemini-nano-banana/server/tools/gemini.ts
import {
  createImageGeneratorTool,
  withContractManagement,
  saveImageToFileSystem,
  extractImageData,
  type GenerateImageInput,
  type GenerateImageOutput,
} from "@decocms/mcps-shared/image-generators";
import type { Env } from "server/main";
import { createGeminiClient } from "./utils/gemini";

const generateImage = (env: Env) => {
  // Core generation logic
  const executeGeneration = async (
    input: GenerateImageInput,
    env: Env
  ): Promise<GenerateImageOutput> => {
    // Call Gemini API
    const client = createGeminiClient(env);
    const response = await client.generateImage(
      input.prompt,
      input.baseImageUrl || undefined,
      input.aspectRatio
    );

    const candidate = response.candidates[0];
    const inlineData = candidate?.content.parts[0].inline_data;

    if (!inlineData?.data) {
      return {
        error: true,
        finishReason: candidate.finishReason || undefined,
      };
    }

    // Extract and save image
    const { mimeType, imageData } = extractImageData(inlineData);
    const { url } = await saveImageToFileSystem(env, {
      imageData,
      mimeType,
      metadata: { prompt: input.prompt },
    });

    return {
      image: url,
      finishReason: candidate.finishReason,
    };
  };

  // Apply middlewares (retry and logging included automatically)
  const executeWithMiddlewares = withContractManagement(executeGeneration, {
    clauseId: "gemini-2.5-flash-image-preview:generateContent",
    contract: "NANOBANANA_CONTRACT",
    provider: "Gemini",
    maxRetries: 3,
  });

  // Create the tool
  return createImageGeneratorTool(env, {
    id: "GENERATE_IMAGE",
    provider: "Gemini 2.5 Flash Image Preview",
    execute: executeWithMiddlewares,
  });
};

export const geminiTools = [generateImage];
```

## Benefits

1. **Code Reduction**: Eliminates common code duplication across image MCPs
2. **Consistency**: All MCPs follow the same input/output contract
3. **Maintainability**: Bug fixes and improvements benefit all MCPs automatically
4. **Extensibility**: Easy to add new providers (DALL-E, Midjourney, etc)
5. **Type Safety**: TypeScript ensures compatibility between MCPs
6. **Billing Integration**: Integrated contract system for cost management

## Creating a New Image MCP

To create a new image generation MCP (e.g., DALL-E):

1. Implement only provider-specific logic
2. Use shared helpers for storage, retry, logging
3. Compose middlewares as needed
4. The input/output contract is already defined

```typescript
// dall-e/server/tools/generate.ts
import {
  createImageGeneratorTool,
  withContractManagement,
  saveImageToFileSystem,
} from "@decocms/mcps-shared/image-generators";

const generateImage = (env: Env) => {
  const executeGeneration = async (input, env) => {
    // Only implement DALL-E specific call
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ prompt: input.prompt }),
    });
    
    const data = await response.json();
    return { image: data.data[0].url };
  };

  // Reuse all helpers! (retry and logging already included)
  return createImageGeneratorTool(env, {
    id: "GENERATE_IMAGE",
    provider: "DALL-E 3",
    execute: withContractManagement(executeGeneration, {
      clauseId: "dall-e:generateImage",
      contract: "OPENAI_CONTRACT",
      provider: "DALL-E",
    }),
  });
};
```

## Adding New Shared Tools

To add new shared tools:

1. Create the file in `/shared/tools/` or `/shared/image-generators/`
2. Add the export in `/shared/package.json`:

```json
{
  "exports": {
    "./tools/my-tool": "./tools/my-tool.ts"
  }
}
```

3. Import in MCPs:

```typescript
import { myTool } from "@decocms/mcps-shared/tools/my-tool";
```
