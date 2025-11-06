# @decocms/mcps-shared

Pacote compartilhado de utilidades, tools e helpers para criar MCPs (Model Context Protocol servers) na plataforma Deco.

## Módulos Disponíveis

### 1. Tools de Usuário (`/tools/user`)

Tools comuns de autenticação e gerenciamento de usuário.

#### Uso

```typescript
import { userTools } from "@decocms/mcps-shared/tools/user";
import type { UserToolsEnv } from "@decocms/mcps-shared/tools/user";

// Seu Env deve estender UserToolsEnv
export type Env = UserToolsEnv & {
  // Suas variáveis específicas...
};

// Use os tools compartilhados
export const tools = [...userTools];
```

#### Tools Inclusos

- `GET_USER` - Retorna informações do usuário autenticado

### 2. Sistema de Image Generators (`/image-generators`)

Framework para criar tools de geração de imagem que seguem um contrato padrão, facilitando a criação de MCPs para diferentes providers de IA (Gemini, DALL-E, Midjourney, Stable Diffusion, etc).

#### Uso Básico

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
    // Chame a API do seu provider
    const response = await callProviderAPI(input.prompt, input.aspectRatio);
    
    // Salve a imagem
    const { url } = await saveImageToFileSystem(env, {
      imageData: response.imageData,
      mimeType: "image/png",
      metadata: { prompt: input.prompt },
    });
    
    return { image: url };
  };

  return createImageGeneratorTool(env, {
    id: "GENERATE_IMAGE",
    provider: "Seu Provider",
    execute: withContractManagement(executeGeneration, {
      clauseId: "provider:generateImage",
      contract: "YOUR_CONTRACT",
      provider: "Provider",
    }),
  });
};
```

#### Schema Padrão

Todos os image generators seguem o mesmo contrato:

**Input:**
- `prompt` (string, obrigatório) - Descrição da imagem a ser gerada
- `baseImageUrl` (string, opcional) - URL de uma imagem base para image-to-image
- `aspectRatio` (enum, opcional) - Aspect ratio: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"

**Output:**
- `image` (string, opcional) - URL da imagem gerada
- `error` (boolean, opcional) - Se houve erro na geração
- `finishReason` (string, opcional) - Razão do término (sucesso, filtro de conteúdo, etc)

#### Middlewares Disponíveis

##### `withRetry(fn, maxRetries?)`

Adiciona lógica de retry automático com exponential backoff.

```typescript
const resilientGeneration = withRetry(executeGeneration, 3);
```

##### `withLogging(fn, providerName)`

Adiciona logging de performance e erros.

```typescript
const loggedGeneration = withLogging(executeGeneration, "Gemini");
```

##### `withTimeout(fn, timeoutMs)`

Adiciona timeout para prevenir execuções muito longas.

```typescript
const timedGeneration = withTimeout(executeGeneration, 60000); // 60 segundos
```

##### `withContractManagement(fn, options)`

Adiciona autorização e settlement de contratos para billing, além de **incluir automaticamente retry e logging**.

Opções:
- `clauseId` (obrigatório) - ID da cláusula do contrato
- `contract` (obrigatório) - Nome da propriedade do contrato no environment
- `provider` (opcional) - Nome do provider para logs (padrão: "Provider")
- `maxRetries` (opcional) - Número máximo de tentativas (padrão: 3)

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

Salva uma imagem base64 no file system.

```typescript
const { url, path } = await saveImageToFileSystem(env, {
  imageData: "data:image/png;base64,...",
  mimeType: "image/png",
  metadata: { prompt: "a beautiful sunset" },
  directory: "/images", // opcional
});
```

##### `extractImageData(inlineData)`

Extrai MIME type e data de um objeto inline_data.

```typescript
const { mimeType, imageData } = extractImageData(response.inline_data);
```

#### Composição de Middlewares

O `withContractManagement` já inclui retry e logging automaticamente. Se precisar adicionar timeout ou outros middlewares:

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

## Exemplo Completo: MCP Gemini Image Generator

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

## Benefícios

1. **Redução de Código**: Elimina duplicação de código comum entre MCPs de imagem
2. **Consistência**: Todos os MCPs seguem o mesmo contrato de input/output
3. **Manutenibilidade**: Bug fixes e melhorias beneficiam todos os MCPs automaticamente
4. **Extensibilidade**: Fácil adicionar novos providers (DALL-E, Midjourney, etc)
5. **Type Safety**: TypeScript garante compatibilidade entre MCPs
6. **Billing Integration**: Sistema de contratos integrado para gerenciamento de custos

## Criando um Novo MCP de Imagem

Para criar um novo MCP de geração de imagem (ex: DALL-E):

1. Implemente apenas a lógica específica do provider
2. Use os helpers compartilhados para storage, retry, logging
3. Componha os middlewares conforme necessário
4. O contrato de input/output já está definido

```typescript
// dall-e/server/tools/generate.ts
import {
  createImageGeneratorTool,
  withContractManagement,
  saveImageToFileSystem,
} from "@decocms/mcps-shared/image-generators";

const generateImage = (env: Env) => {
  const executeGeneration = async (input, env) => {
    // Apenas implemente a chamada específica do DALL-E
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ prompt: input.prompt }),
    });
    
    const data = await response.json();
    return { image: data.data[0].url };
  };

  // Reutilize todos os helpers! (retry e logging já incluídos)
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

## Adicionando Novos Tools Compartilhados

Para adicionar novos tools compartilhados:

1. Crie o arquivo em `/shared/tools/` ou `/shared/image-generators/`
2. Adicione o export em `/shared/package.json`:

```json
{
  "exports": {
    "./tools/meu-tool": "./tools/meu-tool.ts"
  }
}
```

3. Importe nos MCPs:

```typescript
import { meuTool } from "@decocms/mcps-shared/tools/meu-tool";
```
