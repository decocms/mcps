# Storage - Módulo Compartilhado

Módulo unificado de storage para todos os MCPs. Fornece uma interface consistente para trabalhar com diferentes provedores de armazenamento de objetos.

## 🚀 Quick Start

**Não quer ler tudo? Comece aqui:**
- 📖 **[Quick Start - 3 passos para salvar imagens](./QUICKSTART.md)**
- 📖 **[Todos os provedores disponíveis (Supabase, R2, S3...)](./PROVIDERS.md)**
- 📖 **[Guia completo do Supabase](./SUPABASE_GUIDE.md)**

## 🎯 Objetivo

Centralizar toda a lógica de storage S3-compatível e file system em um único lugar, permitindo que todos os MCPs reutilizem o mesmo código.

**✨ A melhor parte:** Você pode usar **qualquer provedor** (Supabase, AWS S3, Cloudflare R2, MinIO, etc.) e trocar entre eles mudando apenas 1 linha de código!

## 📦 Componentes

### Interface Core

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

- `createStorageFromState()` - Cria storage a partir do state do MCP
- `createS3Storage()` - Cria storage S3
- `createFileSystemStorage()` - Cria storage file system
- `createStorageFromEnv()` - Auto-detecta e cria storage apropriado

## 🚀 Uso Básico

### 1. Usando com MCP State

```typescript
import { createStorageFromState } from "@decocms/mcps-shared/storage";

// Dentro de um tool MCP
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl("/image.png", 3600);
```

### 2. Usando S3 Diretamente

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

### 3. Usando FILE_SYSTEM

```typescript
import { FileSystemStorageAdapter } from "@decocms/mcps-shared/storage";

const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
const url = await storage.getReadUrl("/file.png", 3600);
```

### 4. Auto-detecção

```typescript
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

// Tenta FILE_SYSTEM primeiro, depois S3 do state
const storage = createStorageFromEnv(env);
const url = await storage.getReadUrl("/file.png", 3600);
```

## 📝 Exemplos de Integração

### Exemplo 1: MCP object-storage

**Antes:**

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

**Depois:**

```typescript
// object-storage/server/tools/storage.ts
import { createStorageFromState } from "@decocms/mcps-shared/storage";

const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl(key, expiresIn);
```

### Exemplo 2: MCP gemini-nano-banana (image generator)

**Antes:**

```typescript
import { saveImageToFileSystem } from "@decocms/mcps-shared/image-generators";

const { url } = await saveImageToFileSystem(env, {
  imageData,
  mimeType,
  metadata: { prompt },
});
```

**Depois (usando FILE_SYSTEM):**

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

**Depois (usando R2 - mais barato!):**

```typescript
import { createStorageFromState } from "@decocms/mcps-shared/storage";
import { saveImage } from "@decocms/mcps-shared/image-generators";

// Configure R2 no state do MCP
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const { url } = await saveImage(storage, {
  imageData,
  mimeType,
  metadata: { prompt },
});
```

### Exemplo 3: Novo MCP com Storage

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
      // Auto-detecta storage (FILE_SYSTEM ou S3)
      const storage = createStorageFromEnv(env);
      
      // Gera URL de upload
      const writeUrl = await storage.getWriteUrl(context.path, {
        expiresIn: 60,
      });
      
      // Faz upload
      const buffer = Buffer.from(context.content, "base64");
      await fetch(writeUrl, { method: "PUT", body: buffer });
      
      // Retorna URL de leitura
      const readUrl = await storage.getReadUrl(context.path, 3600);
      return { url: readUrl };
    },
  });
```

## 🔧 Configuração do State

Para usar S3StorageAdapter via state, configure no MCP:

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

## 🎨 Operações Avançadas

### Listar Objetos

```typescript
import { S3StorageAdapter } from "@decocms/mcps-shared/storage";

const storage = new S3StorageAdapter({ ... });

const result = await storage.listObjects({
  prefix: "/images/",
  maxKeys: 100,
});

console.log(result.objects); // Array de objetos
console.log(result.isTruncated); // Tem mais páginas?
```

### Obter Metadata

```typescript
const metadata = await storage.getMetadata("/image.png");
console.log(metadata.contentType); // "image/png"
console.log(metadata.contentLength); // 12345
```

### Deletar Objetos

```typescript
// Deletar um
await storage.deleteObject("/image.png");

// Deletar múltiplos (batch)
const result = await storage.deleteObjects([
  "/image1.png",
  "/image2.png",
  "/image3.png",
]);
console.log(result.deleted); // ["image1.png", "image2.png", "image3.png"]
console.log(result.errors); // []
```

## 🧪 Testes

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

// Usar em testes
const mockStorage = new MockStorage();
const url = await mockStorage.getReadUrl("/test.png", 3600);
expect(url).toBe("mock://read/test.png");
```

## ✅ Benefícios

1. **Código Único** - Toda lógica de storage em um só lugar
2. **Reutilização** - Todos os MCPs usam o mesmo código
3. **Consistência** - API unificada para todos os provedores
4. **Manutenção** - Correções beneficiam todos os MCPs
5. **Testável** - Fácil mockar para testes
6. **Flexível** - Adicione novos provedores facilmente

## 📚 Compatibilidade

### MCPs que podem usar:

- ✅ **object-storage** - Substituir lógica custom por adapters
- ✅ **gemini-nano-banana** - Já usa via image-generators
- ✅ **Qualquer novo MCP** - Use desde o início

### Provedores Suportados:

- ✅ **AWS S3** - Storage original
- ✅ **Cloudflare R2** - Egress grátis (mais barato!)
- ✅ **Supabase Storage** - S3-compatible + RLS policies
- ✅ **MinIO** - Self-hosted S3-compatible
- ✅ **DigitalOcean Spaces** - S3-compatible
- ✅ **Google Cloud Storage** - Modo S3-compatible
- ✅ **Deco FILE_SYSTEM** - Binding nativo do Deco
- ✅ **Qualquer provedor S3-compatible**

📖 **[Guia completo do Supabase](./SUPABASE_GUIDE.md)**

## 🔄 Migração

### Para object-storage:

```typescript
// Substituir
const s3Client = createS3Client(env);
const command = new GetObjectCommand({ ... });
const url = await getSignedUrl(s3Client, command, { expiresIn });

// Por
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl(key, expiresIn);
```

### Para image-generators:

```typescript
// Substituir
const storage = new S3StorageAdapter(s3Client, bucket);

// Por
import { S3StorageAdapter } from "@decocms/mcps-shared/storage";
const storage = new S3StorageAdapter(config);
```

## 📦 Dependências

Opcionais (apenas se usar S3):
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 🤝 Contribuindo

Ao adicionar novos adapters:

1. Implemente `ObjectStorage` ou `ExtendedObjectStorage`
2. Adicione testes
3. Documente no README
4. Adicione factory helper se apropriado

