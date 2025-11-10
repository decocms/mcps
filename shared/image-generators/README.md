# Image Generators - Shared Module

Shared module for building MCP image generation tools with flexible support for different storage providers.

## Features

- 🔌 **Pluggable Storage**: Inject any storage provider (S3, R2, MinIO, file system, etc.)
- 🎨 **Standardized Middleware**: Unified interface for different AI generators
- 📦 **Type-Safe**: Fully typed with TypeScript
- 🧪 **Testable**: Interface-based architecture facilitates testing
- 🔄 **Backward Compatible**: Maintains compatibility with existing code

## Installation

This module is part of the MCPs monorepo. To use:

```typescript
import {
  saveImage,
  S3StorageAdapter,
  FileSystemStorageAdapter,
  ObjectStorage,
  extractImageData,
} from "@shared/image-generators";
```

## Main Components

### 1. ObjectStorage Interface

Generic interface for storage providers:

```typescript
interface ObjectStorage {
  getReadUrl(path: string, expiresIn: number): Promise<string>;
  getWriteUrl(path: string, options: {...}): Promise<string>;
}
```

### 2. Available Adapters

#### S3StorageAdapter

For any S3-compatible provider (AWS S3, R2, MinIO, etc.):

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter } from "@shared/image-generators";

const s3Client = new S3Client({ region: "us-east-1" });
const storage = new S3StorageAdapter(s3Client, "my-bucket");
```

#### FileSystemStorageAdapter

For use with Deco's FILE_SYSTEM binding:

```typescript
import { FileSystemStorageAdapter } from "@shared/image-generators";

const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
```

### 3. Storage Functions

#### saveImage()

Main function for saving images using any ObjectStorage:

```typescript
const result = await saveImage(storage, {
  imageData: "data:image/png;base64,...",
  mimeType: "image/png",
  metadata: { prompt: "beautiful sunset" },
  directory: "/images",
  fileName: "custom-name", // optional
  readExpiresIn: 3600, // 1 hour (default)
  writeExpiresIn: 60, // 1 minute (default)
});

console.log(result.url);  // Public URL to access the image
console.log(result.path); // Path where it was saved
```

#### extractImageData()

Extracts image data from inline objects:

```typescript
const { mimeType, imageData } = extractImageData(inlineData);
```

## Basic Usage

### Complete Example: Image Generator with S3

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { createTool } from "@decocms/runtime/mastra";
import {
  S3StorageAdapter,
  saveImage,
  extractImageData,
} from "@shared/image-generators";
import { z } from "zod";

export const createImageGeneratorTool = (env: Env) => {
  // Configure storage once
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const storage = new S3StorageAdapter(s3Client, env.S3_BUCKET);

  return createTool({
    id: "GENERATE_IMAGE",
    description: "Generates an image using AI",
    inputSchema: z.object({
      prompt: z.string().describe("Image description"),
    }),
    execute: async ({ context, input }) => {
      // 1. Generate image with AI
      const generatedImage = await yourAIModel.generate(input.prompt);
      
      // 2. Extract image data
      const { mimeType, imageData } = extractImageData(
        generatedImage.inlineData
      );
      
      // 3. Save using injected storage
      const result = await saveImage(storage, {
        imageData,
        mimeType,
        metadata: {
          prompt: input.prompt,
          model: "your-model",
          generated_at: new Date().toISOString(),
        },
        directory: "/generated",
      });
      
      return {
        url: result.url,
        path: result.path,
      };
    },
  });
};
```

## Supported Storage Providers

### AWS S3

```typescript
const s3Client = new S3Client({
  region: "us-east-1",
  credentials: { ... },
});
const storage = new S3StorageAdapter(s3Client, "bucket-name");
```

### Cloudflare R2

```typescript
const r2Client = new S3Client({
  region: "auto",
  endpoint: "https://account-id.r2.cloudflarestorage.com",
  credentials: { ... },
});
const storage = new S3StorageAdapter(r2Client, "bucket-name");
```

### MinIO

```typescript
const minioClient = new S3Client({
  region: "us-east-1",
  endpoint: "http://localhost:9000",
  credentials: { ... },
  forcePathStyle: true,
});
const storage = new S3StorageAdapter(minioClient, "bucket-name");
```

### DigitalOcean Spaces

```typescript
const spacesClient = new S3Client({
  region: "nyc3",
  endpoint: "https://nyc3.digitaloceanspaces.com",
  credentials: { ... },
});
const storage = new S3StorageAdapter(spacesClient, "space-name");
```

### Google Cloud Storage (S3 Compatible)

```typescript
const gcsClient = new S3Client({
  region: "auto",
  endpoint: "https://storage.googleapis.com",
  credentials: { ... }, // HMAC keys
});
const storage = new S3StorageAdapter(gcsClient, "bucket-name");
```

## Custom Implementation

Create your own adapter by implementing `ObjectStorage`:

```typescript
class MyCustomStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number): Promise<string> {
    // Your logic for generating read URL
    return "https://...";
  }

  async getWriteUrl(path: string, options: {...}): Promise<string> {
    // Your logic for generating write URL
    return "https://...";
  }
}

const storage = new MyCustomStorage();
const result = await saveImage(storage, { ... });
```

## Testing

Facilitate testing by creating interface mocks:

```typescript
class MockStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number) {
    return `mock://read/${path}`;
  }

  async getWriteUrl(path: string, options: any) {
    return `mock://write/${path}`;
  }
}

// In your tests
const mockStorage = new MockStorage();
const result = await saveImage(mockStorage, { ... });
expect(result.url).toBe("mock://read/...");
```

## Middleware (Base)

The module also includes base utilities for building generation tools:

```typescript
import { createImageGeneratorTool } from "@shared/image-generators";

// TODO: Middleware documentation will be expanded
```

## Migration

### From `saveImageToFileSystem` to `saveImage`

**Before:**

```typescript
const result = await saveImageToFileSystem(env, {
  imageData: "...",
  mimeType: "image/png",
});
```

**After:**

```typescript
const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
const result = await saveImage(storage, {
  imageData: "...",
  mimeType: "image/png",
});
```

The old function still works (marked as `@deprecated`), but migration is recommended for greater flexibility.

## Complete Examples

See [EXAMPLES.md](./EXAMPLES.md) for detailed usage examples with different providers.

## Dependencies

### Required

- None! The core module has no external dependencies.

### Optional

To use `S3StorageAdapter`:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Contributing

This module is part of the MCPs monorepo. To contribute:

1. Keep the `ObjectStorage` interface simple and generic
2. Add tests for new adapters
3. Document new storage providers
4. Maintain backward compatibility

## License

See LICENSE in the main repository.

