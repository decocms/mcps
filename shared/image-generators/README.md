# Image Generators - Shared Module

Módulo compartilhado para construir ferramentas MCP de geração de imagens com suporte flexível a diferentes provedores de storage.

## Características

- 🔌 **Storage Plugável**: Injete qualquer provedor de storage (S3, R2, MinIO, file system, etc.)
- 🎨 **Middleware Padronizado**: Interface unificada para diferentes geradores de IA
- 📦 **Type-Safe**: Totalmente tipado com TypeScript
- 🧪 **Testável**: Arquitetura baseada em interfaces facilita testes
- 🔄 **Backward Compatible**: Mantém compatibilidade com código existente

## Instalação

Este módulo faz parte do monorepo de MCPs. Para usar:

```typescript
import {
  saveImage,
  S3StorageAdapter,
  FileSystemStorageAdapter,
  ObjectStorage,
  extractImageData,
} from "@shared/image-generators";
```

## Componentes Principais

### 1. ObjectStorage Interface

Interface genérica para provedores de storage:

```typescript
interface ObjectStorage {
  getReadUrl(path: string, expiresIn: number): Promise<string>;
  getWriteUrl(path: string, options: {...}): Promise<string>;
}
```

### 2. Adapters Disponíveis

#### S3StorageAdapter

Para qualquer provedor compatível com S3 (AWS S3, R2, MinIO, etc.):

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter } from "@shared/image-generators";

const s3Client = new S3Client({ region: "us-east-1" });
const storage = new S3StorageAdapter(s3Client, "my-bucket");
```

#### FileSystemStorageAdapter

Para usar com binding FILE_SYSTEM do Deco:

```typescript
import { FileSystemStorageAdapter } from "@shared/image-generators";

const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
```

### 3. Funções de Storage

#### saveImage()

Função principal para salvar imagens usando qualquer ObjectStorage:

```typescript
const result = await saveImage(storage, {
  imageData: "data:image/png;base64,...",
  mimeType: "image/png",
  metadata: { prompt: "beautiful sunset" },
  directory: "/images",
  fileName: "custom-name", // opcional
  readExpiresIn: 3600, // 1 hora (padrão)
  writeExpiresIn: 60, // 1 minuto (padrão)
});

console.log(result.url);  // URL pública para acessar a imagem
console.log(result.path); // Caminho onde foi salva
```

#### extractImageData()

Extrai dados de imagem de objetos inline:

```typescript
const { mimeType, imageData } = extractImageData(inlineData);
```

## Uso Básico

### Exemplo Completo: Gerador de Imagens com S3

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
  // Configurar storage uma vez
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
    description: "Gera uma imagem usando IA",
    inputSchema: z.object({
      prompt: z.string().describe("Descrição da imagem"),
    }),
    execute: async ({ context, input }) => {
      // 1. Gerar imagem com IA
      const generatedImage = await yourAIModel.generate(input.prompt);
      
      // 2. Extrair dados da imagem
      const { mimeType, imageData } = extractImageData(
        generatedImage.inlineData
      );
      
      // 3. Salvar usando storage injetado
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

## Provedores de Storage Suportados

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

## Implementação Customizada

Crie seu próprio adapter implementando `ObjectStorage`:

```typescript
class MyCustomStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number): Promise<string> {
    // Sua lógica para gerar URL de leitura
    return "https://...";
  }

  async getWriteUrl(path: string, options: {...}): Promise<string> {
    // Sua lógica para gerar URL de escrita
    return "https://...";
  }
}

const storage = new MyCustomStorage();
const result = await saveImage(storage, { ... });
```

## Testes

Facilite testes criando mocks da interface:

```typescript
class MockStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number) {
    return `mock://read/${path}`;
  }

  async getWriteUrl(path: string, options: any) {
    return `mock://write/${path}`;
  }
}

// Em seus testes
const mockStorage = new MockStorage();
const result = await saveImage(mockStorage, { ... });
expect(result.url).toBe("mock://read/...");
```

## Middleware (Base)

O módulo também inclui utilitários base para construir ferramentas de geração:

```typescript
import { createImageGeneratorTool } from "@shared/image-generators";

// TODO: Documentação do middleware será expandida
```

## Migração

### De `saveImageToFileSystem` para `saveImage`

**Antes:**

```typescript
const result = await saveImageToFileSystem(env, {
  imageData: "...",
  mimeType: "image/png",
});
```

**Depois:**

```typescript
const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
const result = await saveImage(storage, {
  imageData: "...",
  mimeType: "image/png",
});
```

A função antiga ainda funciona (marcada como `@deprecated`), mas recomenda-se migrar para maior flexibilidade.

## Exemplos Completos

Veja [EXAMPLES.md](./EXAMPLES.md) para exemplos detalhados de uso com diferentes provedores.

## Dependências

### Obrigatórias

- Nenhuma! O módulo core não tem dependências externas.

### Opcionais

Para usar `S3StorageAdapter`:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Contribuindo

Este módulo faz parte do monorepo de MCPs. Para contribuir:

1. Mantenha a interface `ObjectStorage` simples e genérica
2. Adicione testes para novos adapters
3. Documente novos provedores de storage
4. Mantenha backward compatibility

## Licença

Veja LICENSE no repositório principal.

