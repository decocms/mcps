# Storage - Shared Module

Unified storage module for all MCPs. Provides a consistent interface for working with different object storage providers.

## 🚀 Quick Start

**Don't want to read everything? Start here:**
- 📖 **[Quick Start - 3 steps to save images](./QUICKSTART.md)**
- 📖 **[All available providers (Supabase, R2, S3...)](./PROVIDERS.md)**
- 📖 **[Complete Supabase guide](./SUPABASE_GUIDE.md)**

## 🎯 Goal

Centralize all S3-compatible storage and file system logic in a single place, allowing all MCPs to reuse the same code.

**✨ The best part:** You can use **any provider** (Supabase, AWS S3, Cloudflare R2, MinIO, etc.) and switch between them by changing just 1 line of code!

## 📦 Components

### Core Interface

```typescript
interface ObjectStorage {
  getReadUrl(path: string, expiresIn: number): Promise<string>;
  getWriteUrl(path: string, options: {...}): Promise<string>;
}

interface ExtendedObjectStorage extends ObjectStorage {
  listObjects?(options: {...}): Promise<{...}>;
  getMetadata?(key: string): Promise<{...}>;
  deleteObject?(key: string): Promise<void>;
  deleteObjects?(keys: string[]): Promise<{...}>;
}
```

### Adapters

1. **S3StorageAdapter** - AWS S3, R2, MinIO, etc.
2. **FileSystemStorageAdapter** - Deco FILE_SYSTEM binding

### Factories

- `createStorageFromState()` - Creates storage from MCP state
- `createS3Storage()` - Creates S3 storage
- `createFileSystemStorage()` - Creates file system storage
- `createStorageFromEnv()` - Auto-detects and creates appropriate storage

## 🚀 Basic Usage

### 1. Using with MCP State

```typescript
import { createStorageFromState } from "@decocms/mcps-shared/storage";

// Inside an MCP tool
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl("/image.png", 3600);
```

### 2. Using S3 Directly

```typescript
import { S3StorageAdapter } from "@decocms/mcps-shared/storage";

const storage = new S3StorageAdapter({
  region: "us-east-1",
  accessKeyId: "...",
  secretAccessKey: "...",
  bucketName: "my-bucket",
});

const readUrl = await storage.getReadUrl("/file.png", 3600);
const writeUrl = await storage.getWriteUrl("/file.png", {
  contentType: "image/png",
  expiresIn: 60,
});
```

### 3. Using FILE_SYSTEM

```typescript
import { FileSystemStorageAdapter } from "@decocms/mcps-shared/storage";

const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
const url = await storage.getReadUrl("/file.png", 3600);
```

### 4. Auto-detection

```typescript
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

// Tries FILE_SYSTEM first, then S3 from state
const storage = createStorageFromEnv(env);
const url = await storage.getReadUrl("/file.png", 3600);
```

## 📝 Integration Examples

### Example 1: object-storage MCP

**Before:**

```typescript
// object-storage/server/lib/s3-client.ts
export function createS3Client(env: Env): S3Client {
  const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
  return new S3Client({
    region: state.region,
    credentials: {
      accessKeyId: state.accessKeyId,
      secretAccessKey: state.secretAccessKey,
    },
    endpoint: state.endpoint,
  });
}

// object-storage/server/tools/storage.ts
const s3Client = createS3Client(env);
const command = new GetObjectCommand({ Bucket: state.bucketName, Key: key });
const url = await getSignedUrl(s3Client, command, { expiresIn });
```

**After:**

```typescript
// object-storage/server/tools/storage.ts
import { createStorageFromState } from "@decocms/mcps-shared/storage";

const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl(key, expiresIn);
```

### Example 2: gemini-nano-banana MCP (image generator)

**Before:**

```typescript
import { saveImageToFileSystem } from "@decocms/mcps-shared/image-generators";

const { url } = await saveImageToFileSystem(env, {
  imageData,
  mimeType,
  metadata: { prompt },
});
```

**After (using FILE_SYSTEM):**

```typescript
import { FileSystemStorageAdapter } from "@decocms/mcps-shared/storage";
import { saveImage } from "@decocms/mcps-shared/image-generators";

const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
const { url } = await saveImage(storage, {
  imageData,
  mimeType,
  metadata: { prompt },
});
```

**After (using R2 - cheaper!):**

```typescript
import { createStorageFromState } from "@decocms/mcps-shared/storage";
import { saveImage } from "@decocms/mcps-shared/image-generators";

// Configure R2 in MCP state
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const { url } = await saveImage(storage, {
  imageData,
  mimeType,
  metadata: { prompt },
});
```

### Example 3: New MCP with Storage

```typescript
import { createPrivateTool } from "@decocms/runtime/mastra";
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";
import { z } from "zod";

export const createUploadTool = (env: Env) =>
  createPrivateTool({
    id: "UPLOAD_FILE",
    description: "Upload a file to storage",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(), // base64
    }),
    execute: async ({ context }) => {
      // Auto-detect storage (FILE_SYSTEM or S3)
      const storage = createStorageFromEnv(env);
      
      // Generate upload URL
      const writeUrl = await storage.getWriteUrl(context.path, {
        expiresIn: 60,
      });
      
      // Upload
      const buffer = Buffer.from(context.content, "base64");
      await fetch(writeUrl, { method: "PUT", body: buffer });
      
      // Return read URL
      const readUrl = await storage.getReadUrl(context.path, 3600);
      return { url: readUrl };
    },
  });
```

## 🔧 State Configuration

To use S3StorageAdapter via state, configure in MCP:

```typescript
export const StateSchema = BaseStateSchema.extend({
  region: z.string().describe("AWS region"),
  accessKeyId: z.string().describe("Access key ID"),
  secretAccessKey: z.string().describe("Secret access key"),
  endpoint: z.string().optional().describe("Custom endpoint for R2, MinIO, etc."),
  bucketName: z.string().describe("Bucket name"),
  defaultPresignedUrlExpiration: z.number().optional().describe("Default expiration in seconds"),
});
```

## 🎨 Advanced Operations

### List Objects

```typescript
import { S3StorageAdapter } from "@decocms/mcps-shared/storage";

const storage = new S3StorageAdapter({ ... });

const result = await storage.listObjects({
  prefix: "/images/",
  maxKeys: 100,
});

console.log(result.objects); // Array of objects
console.log(result.isTruncated); // More pages available?
```

### Get Metadata

```typescript
const metadata = await storage.getMetadata("/image.png");
console.log(metadata.contentType); // "image/png"
console.log(metadata.contentLength); // 12345
```

### Delete Objects

```typescript
// Delete one
await storage.deleteObject("/image.png");

// Delete multiple (batch)
const result = await storage.deleteObjects([
  "/image1.png",
  "/image2.png",
  "/image3.png",
]);
console.log(result.deleted); // ["image1.png", "image2.png", "image3.png"]
console.log(result.errors); // []
```

## 🧪 Testing

```typescript
import { ObjectStorage } from "@decocms/mcps-shared/storage";

class MockStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number) {
    return `mock://read/${path}`;
  }
  async getWriteUrl(path: string, options: any) {
    return `mock://write/${path}`;
  }
}

// Use in tests
const mockStorage = new MockStorage();
const url = await mockStorage.getReadUrl("/test.png", 3600);
expect(url).toBe("mock://read/test.png");
```

## ✅ Benefits

1. **Single Codebase** - All storage logic in one place
2. **Reusability** - All MCPs use the same code
3. **Consistency** - Unified API for all providers
4. **Maintenance** - Fixes benefit all MCPs
5. **Testable** - Easy to mock for testing
6. **Flexible** - Add new providers easily

## 📚 Compatibility

### MCPs that can use:

- ✅ **object-storage** - Replace custom logic with adapters
- ✅ **gemini-nano-banana** - Already uses via image-generators
- ✅ **Any new MCP** - Use from the start

### Supported Providers:

- ✅ **AWS S3** - Original storage
- ✅ **Cloudflare R2** - Free egress (cheaper!)
- ✅ **Supabase Storage** - S3-compatible + RLS policies
- ✅ **MinIO** - Self-hosted S3-compatible
- ✅ **DigitalOcean Spaces** - S3-compatible
- ✅ **Google Cloud Storage** - S3-compatible mode
- ✅ **Deco FILE_SYSTEM** - Native Deco binding
- ✅ **Any S3-compatible provider**

📖 **[Complete Supabase guide](./SUPABASE_GUIDE.md)**

## 🔄 Migration

### For object-storage:

```typescript
// Replace
const s3Client = createS3Client(env);
const command = new GetObjectCommand({ ... });
const url = await getSignedUrl(s3Client, command, { expiresIn });

// With
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl(key, expiresIn);
```

### For image-generators:

```typescript
// Replace
const storage = new S3StorageAdapter(s3Client, bucket);

// With
import { S3StorageAdapter } from "@decocms/mcps-shared/storage";
const storage = new S3StorageAdapter(config);
```

## 📦 Dependencies

Optional (only if using S3):
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 🤝 Contributing

When adding new adapters:

1. Implement `ObjectStorage` or `ExtendedObjectStorage`
2. Add tests
3. Document in README
4. Add factory helper if appropriate

