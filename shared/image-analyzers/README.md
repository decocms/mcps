# Image Analyzers Shared Library

Esta biblioteca fornece uma abstração compartilhada para criar ferramentas de análise de imagem (Image Analysis Tools) em MCPs, similar ao que existe para geradores de vídeo.

## 🎯 Objetivo

Padronizar a implementação de análise de imagens através de diferentes providers (Gemini Vision, GPT-4 Vision, Claude Vision, etc.) reduzindo código duplicado e mantendo consistência.

## 🚀 Como Usar

### Exemplo Básico

```typescript
import { createImageAnalyzerTools } from "@decocms/mcps-shared/image-analyzers";
import type { Env } from "../main.ts";
import { createMyVisionClient } from "./utils/my-vision-client.ts";

export const visionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "My Vision API",
    description: "Analisa imagens usando My Vision API",
  },
  getClient: (env) => createMyVisionClient(env),
  
  // Tool obrigatória: analyze
  analyzeTool: {
    execute: async ({ env, input, client }) => {
      const response = await client.analyzeImage(
        input.imageUrl,
        input.prompt,
        input.model
      );
      
      return {
        analysis: response.text,
        finishReason: response.finishReason,
        usageMetadata: response.usage,
      };
    },
  },
  
  // Tool opcional: compare
  compareTool: {
    execute: async ({ env, input, client }) => {
      const response = await client.compareImages(
        input.imageUrls,
        input.prompt,
        input.model
      );
      
      return {
        comparison: response.text,
        finishReason: response.finishReason,
        usageMetadata: response.usage,
      };
    },
  },
  
  // Tool opcional: extract text (OCR)
  extractTextTool: {
    execute: async ({ env, input, client }) => {
      const languageHint = input.language 
        ? ` O texto está em ${input.language}.` 
        : "";
      const prompt = `Extraia TODO o texto visível nesta imagem.${languageHint}`;
      
      const response = await client.analyzeImage(
        input.imageUrl,
        prompt,
        input.model
      );
      
      return {
        text: response.text,
        finishReason: response.finishReason,
        usageMetadata: response.usage,
      };
    },
  },
});
```

### Exportar as Tools

```typescript
// server/tools/index.ts
import { userTools } from "@decocms/mcps-shared/tools/user";
import { visionTools } from "./vision.ts";

export const tools = [
  ...userTools,
  visionTools.analyzeImage,
  visionTools.compareImages,
  visionTools.extractTextFromImage,
];
```

## 📦 Ferramentas Disponíveis

### 1. `analyzeImage` (obrigatória)
Analisa uma única imagem com base em um prompt.

**Input:**
- `imageUrl`: URL da imagem
- `prompt`: Pergunta ou instrução sobre a imagem
- `model`: (opcional) Modelo a usar

**Output:**
- `analysis`: Texto com a análise
- `finishReason`: Motivo do término
- `usageMetadata`: Informações de uso de tokens

### 2. `compareImages` (opcional)
Compara múltiplas imagens.

**Input:**
- `imageUrls`: Array de URLs (mínimo 2)
- `prompt`: Como comparar as imagens
- `model`: (opcional) Modelo a usar

**Output:**
- `comparison`: Texto com a comparação
- `finishReason`: Motivo do término
- `usageMetadata`: Informações de uso de tokens

### 3. `extractTextFromImage` (opcional)
Extrai texto de imagens (OCR).

**Input:**
- `imageUrl`: URL da imagem
- `language`: (opcional) Idioma do texto
- `model`: (opcional) Modelo a usar

**Output:**
- `text`: Texto extraído
- `finishReason`: Motivo do término
- `usageMetadata`: Informações de uso de tokens

## 🔧 Recursos Incluídos

### Middleware
- **Retry**: Tenta novamente em caso de falha (3 tentativas por padrão)
- **Timeout**: Cancela após 60 segundos
- **Logging**: Registra início, fim e erros

### Contract Support (Billing)
- **Authorization**: Autoriza cobranças antes da operação
- **Settlement**: Finaliza cobrança após sucesso
- **Rollback**: Não cobra em caso de falha
- **Opcional**: Cada tool pode ter ou não contract

### Schemas Padronizados
Todos os inputs e outputs são validados com Zod, garantindo type-safety.

## 🎨 Exemplos de Providers

### Gemini Vision (com Contract)
```typescript
export const geminiVisionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "Gemini Pro Vision",
  },
  getClient: (env) => createGeminiVisionClient(env),
  analyzeTool: {
    execute: async ({ input, client }) => {
      const response = await client.analyzeImage(input.imageUrl, input.prompt);
      return { analysis: response.text };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT,
      clause: {
        clauseId: "gemini-pro-vision:analyzeImage",
        amount: 1,
      },
    }),
  },
  compareTool: {
    execute: async ({ input, client }) => {
      const response = await client.compareImages(input.imageUrls, input.prompt);
      return { comparison: response.text };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT,
      clause: {
        clauseId: "gemini-pro-vision:compareImages",
        amount: 1,
      },
    }),
  },
  extractTextTool: {
    execute: async ({ input, client }) => {
      const response = await client.extractText(input.imageUrl);
      return { text: response.text };
    },
    getContract: (env) => ({
      binding: env.GEMINI_VISION_CONTRACT,
      clause: {
        clauseId: "gemini-pro-vision:extractText",
        amount: 1,
      },
    }),
  },
});
```

**wrangler.toml:**
```toml
[[deco.bindings]]
type = "contract"
name = "GEMINI_VISION_CONTRACT"

[deco.bindings.contract]
body = "U$0.05 per analysis, U$0.10 per comparison, U$0.03 per OCR"

[[deco.bindings.contract.clauses]]
id = "gemini-pro-vision:analyzeImage"
price = 0.05
description = "$0.05 per image analysis"

[[deco.bindings.contract.clauses]]
id = "gemini-pro-vision:compareImages"
price = 0.10
description = "$0.10 per image comparison"

[[deco.bindings.contract.clauses]]
id = "gemini-pro-vision:extractText"
price = 0.03
description = "$0.03 per OCR operation"
```

### GPT-4 Vision
```typescript
export const gpt4VisionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "GPT-4 Vision",
  },
  getClient: (env) => createOpenAIClient(env),
  analyzeTool: { /* ... */ },
  // GPT-4V suporta múltiplas imagens nativamente
  compareTool: { /* ... */ },
  extractTextTool: { /* ... */ },
});
```

### Claude Vision
```typescript
export const claudeVisionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "Claude Vision",
  },
  getClient: (env) => createAnthropicClient(env),
  analyzeTool: { /* ... */ },
  // Claude também suporta múltiplas imagens
  compareTool: { /* ... */ },
  extractTextTool: { /* ... */ },
});
```

## 🔍 Diferenças vs Video Generators

| Feature | Video Generators | Image Analyzers |
|---------|-----------------|----------------|
| **Operação Principal** | Gerar vídeo | Analisar imagem |
| **Storage** | Obrigatório (salvar vídeo) | Não usado (retorna texto) |
| **Contract** | ✅ Suportado | ✅ Suportado |
| **Timeout Padrão** | 6 minutos | 1 minuto |
| **Tools Opcionais** | list, extend | compare, extractText |
| **Contract por Tool** | Sim (generateTool obrigatório) | Sim (todas opcionais) |

## 📚 Ver Também

- [Video Generators](../video-generators/README.md)
- [Image Generators](../image-generators/README.md)
- [File Management](../tools/file-management/README.md)

