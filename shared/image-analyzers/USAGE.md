# Image Analyzers - Guia de Uso Completo

## 📚 Visão Geral

A biblioteca `image-analyzers` fornece uma abstração completa para criar ferramentas de análise de imagem em MCPs, eliminando código duplicado e padronizando a implementação entre diferentes providers.

## 🎯 Providers Suportados

Esta abstração funciona com qualquer provider de Vision AI:
- ✅ **Google Gemini Pro Vision** (implementado)
- ⚪ GPT-4 Vision (OpenAI)
- ⚪ Claude 3 Vision (Anthropic)
- ⚪ LLaVA
- ⚪ Qualquer outro modelo multimodal

## 🚀 Como Usar

### 1. Estrutura Básica

```typescript
import { createImageAnalyzerTools } from "@decocms/mcps-shared/image-analyzers";
import type { Env } from "../main.ts";

const myVisionTools = createImageAnalyzerTools<Env, MyClientType>({
  metadata: {
    provider: "Meu Provider",
    description: "Descrição opcional",
  },
  getClient: (env) => createMyClient(env),
  
  // Obrigatório
  analyzeTool: { /* ... */ },
  
  // Opcionais
  compareTool: { /* ... */ },
  extractTextTool: { /* ... */ },
});
```

### 2. Implementação Completa (Gemini Vision)

```typescript
// gemini-pro-vision/server/tools/vision.ts
import { createImageAnalyzerTools } from "@decocms/mcps-shared/image-analyzers";
import { createGeminiVisionClient } from "./utils/gemini-vision.ts";
import type { Env } from "../main.ts";

type GeminiVisionClient = ReturnType<typeof createGeminiVisionClient>;

const geminiVisionToolsFactory = createImageAnalyzerTools<
  Env,
  GeminiVisionClient
>({
  metadata: {
    provider: "Gemini Pro Vision",
    description: "Analisa imagens usando Google Gemini",
  },
  
  getClient: (env) =>
    createGeminiVisionClient({
      ...env,
      GEMINI_API_KEY: env.DECO_REQUEST_CONTEXT.state.GEMINI_API_KEY,
    } as Env),

  // Tool 1: Análise de Imagem
  analyzeTool: {
    execute: async ({ input, client }) => {
      const response = await client.analyzeImage(
        input.imageUrl,
        input.prompt,
        input.model,
      );

      const candidate = response.candidates[0];
      const textParts = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      return {
        analysis: textParts,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
  },

  // Tool 2: Comparação de Imagens
  compareTool: {
    execute: async ({ input, client }) => {
      const response = await client.compareImages(
        input.imageUrls,
        input.prompt,
        input.model,
      );

      const candidate = response.candidates[0];
      const text = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      return {
        comparison: text,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
  },

  // Tool 3: Extração de Texto (OCR)
  extractTextTool: {
    execute: async ({ input, client }) => {
      const languageHint = input.language
        ? ` O texto está em ${input.language}.`
        : "";
      const prompt = `Extraia TODO o texto visível nesta imagem.${languageHint}`;

      const response = await client.analyzeImage(
        input.imageUrl,
        prompt,
        input.model,
      );

      const candidate = response.candidates[0];
      const text = candidate.content.parts
        .filter((part: { text?: string }) => part.text)
        .map((part: { text?: string }) => part.text)
        .join("\n");

      return {
        text,
        finishReason: candidate.finishReason,
        usageMetadata: response.usageMetadata,
      };
    },
  },
});

// Exporta as tools como array
export const createVisionTools = (env: Env) => [
  geminiVisionToolsFactory.analyzeImage(env),
  geminiVisionToolsFactory.compareImages!(env),
  geminiVisionToolsFactory.extractTextFromImage!(env),
];
```

### 3. Exportar no index.ts

```typescript
// server/tools/index.ts
import { userTools } from "@decocms/mcps-shared/tools/user";
import { createVisionTools } from "./vision.ts";

export const tools = [
  ...userTools,
  createVisionTools,
];
```

## 📋 Schemas e Tipos

### AnalyzeImage

**Input:**
```typescript
{
  imageUrl: string;      // URL da imagem
  prompt: string;        // O que você quer saber
  model?: string;        // Modelo opcional
}
```

**Output:**
```typescript
{
  analysis: string;                // Texto da análise
  finishReason?: string;           // Motivo do término
  usageMetadata?: {                // Uso de tokens
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
```

### CompareImages

**Input:**
```typescript
{
  imageUrls: string[];   // Mínimo 2 URLs
  prompt: string;        // Como comparar
  model?: string;        // Modelo opcional
}
```

**Output:**
```typescript
{
  comparison: string;              // Texto da comparação
  finishReason?: string;
  usageMetadata?: { /* ... */ };
}
```

### ExtractTextFromImage

**Input:**
```typescript
{
  imageUrl: string;      // URL da imagem
  language?: string;     // Idioma do texto
  model?: string;        // Modelo opcional
}
```

**Output:**
```typescript
{
  text: string;                    // Texto extraído
  finishReason?: string;
  usageMetadata?: { /* ... */ };
}
```

## 🔧 Recursos Incluídos

### Middlewares Automáticos

Todas as tools incluem automaticamente:

1. **Retry (3 tentativas)**
   - Exponential backoff
   - Ignora erros 4xx
   - Relança erros de validação Zod

2. **Logging**
   - Registra início da operação
   - Registra tempo de execução
   - Registra erros

3. **Timeout (60 segundos)**
   - Previne operações muito longas
   - Retorna erro claro

### Configuração dos Middlewares

```typescript
// shared/image-analyzers/base.ts
const MAX_ANALYSIS_RETRIES = 3;
const MAX_ANALYSIS_TIMEOUT_MS = 60_000; // 1 minuto
```

## 💡 Exemplos de Uso

### Exemplo 1: GPT-4 Vision

```typescript
import { createImageAnalyzerTools } from "@decocms/mcps-shared/image-analyzers";
import { createOpenAIClient } from "./utils/openai.ts";

const gpt4VisionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "GPT-4 Vision",
  },
  getClient: (env) => createOpenAIClient(env.OPENAI_API_KEY),
  
  analyzeTool: {
    execute: async ({ input, client }) => {
      const response = await client.chat.completions.create({
        model: input.model || "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              { type: "image_url", image_url: { url: input.imageUrl } },
            ],
          },
        ],
      });

      return {
        analysis: response.choices[0].message.content,
        usageMetadata: {
          promptTokenCount: response.usage.prompt_tokens,
          candidatesTokenCount: response.usage.completion_tokens,
          totalTokenCount: response.usage.total_tokens,
        },
      };
    },
  },
  
  // compareTool e extractTextTool semelhantes...
});
```

### Exemplo 2: Claude Vision

```typescript
import { createImageAnalyzerTools } from "@decocms/mcps-shared/image-analyzers";
import Anthropic from "@anthropic-ai/sdk";

const claudeVisionTools = createImageAnalyzerTools<Env>({
  metadata: {
    provider: "Claude 3",
  },
  getClient: (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  
  analyzeTool: {
    execute: async ({ input, client }) => {
      // Baixar imagem e converter para base64
      const imageResponse = await fetch(input.imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = btoa(
        String.fromCharCode(...new Uint8Array(imageBuffer))
      );

      const response = await client.messages.create({
        model: input.model || "claude-3-opus-20240229",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: input.prompt,
              },
            ],
          },
        ],
      });

      return {
        analysis: response.content[0].text,
        usageMetadata: {
          promptTokenCount: response.usage.input_tokens,
          candidatesTokenCount: response.usage.output_tokens,
          totalTokenCount:
            response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    },
  },
});
```

## ⚙️ Configuração Avançada

### Tools Opcionais

Você não precisa implementar todas as tools:

```typescript
// Apenas análise, sem comparação ou OCR
const simpleTools = createImageAnalyzerTools<Env>({
  metadata: { provider: "Simple Vision" },
  getClient: (env) => createClient(env),
  analyzeTool: { /* ... */ },
  // compareTool e extractTextTool omitidos
});
```

### Cliente Customizado

O tipo do cliente é inferido automaticamente:

```typescript
type MyClient = {
  analyze: (url: string, prompt: string) => Promise<Response>;
  compare: (urls: string[], prompt: string) => Promise<Response>;
};

const tools = createImageAnalyzerTools<Env, MyClient>({
  metadata: { provider: "Custom" },
  getClient: (env): MyClient => ({
    analyze: async (url, prompt) => { /* ... */ },
    compare: async (urls, prompt) => { /* ... */ },
  }),
  analyzeTool: {
    execute: async ({ input, client }) => {
      // client é automaticamente tipado como MyClient
      const response = await client.analyze(input.imageUrl, input.prompt);
      return { analysis: response.text };
    },
  },
});
```

## 🎨 Casos de Uso Comuns

### 1. Análise de Documentos
```typescript
const result = await analyzeImage({
  imageUrl: "https://example.com/invoice.pdf",
  prompt: "Extraia as seguintes informações: data, valor total, itens da nota fiscal",
});
```

### 2. Moderação de Conteúdo
```typescript
const result = await analyzeImage({
  imageUrl: "https://example.com/user-upload.jpg",
  prompt: "Esta imagem contém conteúdo impróprio ou violento? Responda apenas sim ou não e explique brevemente.",
});
```

### 3. Descrição para Acessibilidade
```typescript
const result = await analyzeImage({
  imageUrl: "https://example.com/chart.png",
  prompt: "Descreva este gráfico de forma que uma pessoa com deficiência visual possa entender os dados apresentados.",
});
```

### 4. Comparação de Produtos
```typescript
const result = await compareImages({
  imageUrls: [
    "https://example.com/product-a.jpg",
    "https://example.com/product-b.jpg",
  ],
  prompt: "Compare estes dois produtos e liste as principais diferenças visuais.",
});
```

### 5. OCR de Screenshots
```typescript
const result = await extractTextFromImage({
  imageUrl: "https://example.com/screenshot.png",
  language: "português",
});
```

## 🔍 Debugging

### Logs Automáticos

Os middlewares incluem logging automático:

```
[Gemini Pro Vision - Analyze] Starting image analysis...
[Gemini Pro Vision - Analyze] Completed in 2341ms

[Gemini Pro Vision - Compare] Starting image comparison...
[Retry] Attempt 1 failed, retrying in 2000ms...
[Gemini Pro Vision - Compare] Completed in 4523ms
```

### Erros Comuns

1. **Timeout**: Imagem muito grande ou API lenta
   ```
   Error: Timeout after 60000ms
   ```

2. **Retry Esgotado**: Falhas consecutivas
   ```
   Error: Failed after 3 attempts: Network error
   ```

3. **Validação**: Input inválido
   ```
   ZodError: imageUrl must be a valid URL
   ```

## 📊 Comparação com Código Manual

### Antes (sem abstração)
```typescript
// ~200 linhas de código repetitivo
// Retry manual
// Logging manual
// Validação manual
// 3 tools separadas com código duplicado
```

### Depois (com abstração)
```typescript
// ~50 linhas de código
// Retry automático
// Logging automático
// Validação automática
// 3 tools com código compartilhado
```

**Redução: ~75% de código**

## 🚀 Próximos Passos

1. Implemente seu client específico do provider
2. Use `createImageAnalyzerTools` para criar as tools
3. Exporte as tools no seu MCP
4. Teste com diferentes tipos de imagens
5. Ajuste prompts conforme necessário

## 📚 Referências

- [README.md](./README.md) - Visão geral e exemplos
- [schemas.ts](./schemas.ts) - Definições dos schemas
- [base.ts](./base.ts) - Implementação da factory
- [middleware.ts](./middleware.ts) - Middlewares disponíveis

