# Especificação Técnica - MCPs Deco

> **Propósito:** Este documento é um guia arquitetural para criar MCPs corretamente, seguindo os padrões do monorepo e evitando erros comuns.

## 📋 Índice

1. [Arquitetura e Modelo de Negócio](#arquitetura-e-modelo-de-negócio)
2. [Estrutura Obrigatória de um MCP](#estrutura-obrigatória-de-um-mcp)
3. [Componentes Compartilhados](#componentes-compartilhados)
4. [Como Criar um Novo MCP](#como-criar-um-novo-mcp)
5. [Padrões e Convenções Obrigatórias](#padrões-e-convenções-obrigatórias)
6. [Sistema de Deploy](#sistema-de-deploy)
7. [Referência Rápida](#referência-rápida)
8. [Erros Comuns e Como Evitar](#erros-comuns-e-como-evitar)

---

## Arquitetura e Modelo de Negócio

### Stack Técnica

- **Runtime**: Cloudflare Workers (via `@decocms/runtime`)
- **Linguagem**: TypeScript
- **Package Manager**: Bun (workspaces)
- **Build**: Vite
- **Frontend**: React + TailwindCSS (opcional)
- **Arquitetura**: Multi-tenant, baseada em bindings e contracts

---

## Modelo de Negócio

### O que é um MCP?

Um **Model Context Protocol server** é uma aplicação que:
- Expõe **ferramentas (tools)** que podem ser usadas por agentes de IA
- Pode ter uma **interface web (views)** para interação humana
- É executado como um **Cloudflare Worker**
- Pode solicitar **permissões (scopes)** para acessar recursos de outros apps
- Possui um **schema de estado** que define configurações por instalação

### Plataforma Deco

Os MCPs são executados na plataforma **Deco**, que fornece:

#### 1. **Runtime (`@decocms/runtime`)**
- Framework base para criar MCPs
- Sistema de autenticação OAuth
- Gerenciamento de estado multi-tenant
- Roteamento automático (`/mcp` para tools, `/` para views)

#### 2. **Bindings (Dependências entre Apps)**
Um MCP pode declarar dependências de outros apps instalados pelo usuário:

```typescript
// Exemplo: nanobanana precisa de FILE_SYSTEM e CONTRACT
scopes: [
  Scopes.NANOBANANA_CONTRACT.CONTRACT_AUTHORIZE,
  Scopes.NANOBANANA_CONTRACT.CONTRACT_SETTLE,
  Scopes.FILE_SYSTEM.FS_WRITE,
  Scopes.FILE_SYSTEM.FS_READ,
]
```

**Bindings comuns:**
- `FILE_SYSTEM` - Sistema de arquivos da Deco
- `AI_GATEWAY` - Gateway para modelos de IA (sem precisar de API keys)
- `CONTRACT` - Sistema de contratos para billing/cobrança
- `STORAGE` - Armazenamento genérico

#### 3. **Contracts (Sistema de Billing)**
Sistema para cobrar por uso de recursos:

```typescript
// Autoriza o gasto
await env.CONTRACT.authorize({
  clauseId: "gemini:generateImage",
  amount: 1
});

// Executa a operação
const result = await generateImage();

// Cobra o valor
await env.CONTRACT.settle({
  clauseId: "gemini:generateImage",
  amount: 1
});
```

#### 4. **State Schema (Multi-tenancy)**
Cada instalação de um MCP pode ter configurações diferentes:

```typescript
export const StateSchema = BaseStateSchema.extend({
  apiKey: z.string().describe("API key for external service"),
  region: z.string().describe("AWS region"),
  customSetting: z.boolean().optional(),
});
```

Quando um usuário instala o app, ele preenche esses campos. Cada projeto/usuário pode ter valores diferentes.

### Fluxo de Uso

1. **Usuário instala um MCP** na plataforma Deco
2. **Preenche o State Schema** com configurações específicas
3. **Autoriza os scopes** necessários (ex: acesso ao FILE_SYSTEM)
4. **MCP fica disponível** para uso:
   - Por agentes de IA (via tools no endpoint `/mcp`)
   - Por humanos (via interface web em `/`)

---

## Arquitetura

---

## Estrutura Obrigatória de um MCP

### Layout de Diretórios

```
mcp-name/
├── server/              # ✅ OBRIGATÓRIO - Backend (Cloudflare Worker)
│   ├── main.ts         # ✅ OBRIGATÓRIO - Entry point
│   ├── tools/          # ✅ OBRIGATÓRIO - Ferramentas para IA
│   │   ├── index.ts    # ✅ OBRIGATÓRIO - Exporta todas as tools
│   │   └── *.ts        # Implementação de cada tool
│   ├── views.ts        # ⚙️ OPCIONAL - Rotas para UI
│   ├── lib/            # ⚙️ OPCIONAL - Utilitários específicos
│   ├── utils/          # ⚙️ OPCIONAL - Helper functions
│   └── constants.ts    # ⚙️ OPCIONAL - Constantes
├── view/               # ⚙️ OPCIONAL - Frontend React
│   └── src/
│       ├── main.tsx    # Entry point do React
│       ├── routes/     # Páginas
│       ├── components/ # Componentes
│       └── hooks/      # React hooks
├── shared/
│   └── deco.gen.ts     # ✅ AUTO-GERADO - Tipos Deco
├── package.json        # ✅ OBRIGATÓRIO
├── tsconfig.json       # ✅ OBRIGATÓRIO
├── vite.config.ts      # ✅ OBRIGATÓRIO
└── wrangler.toml       # ✅ OBRIGATÓRIO
```

### Tipos de MCP

**Use o tipo certo para seu caso:**

| Tipo | Quando usar | Template |
|------|-------------|----------|
| **minimal** | API-only, apenas tools para IA | `--template minimal` |
| **with-view** | Needs UI + API, interface web | `--template with-view` (padrão) |

> 💡 **Dica:** Se não sabe qual escolher, use `with-view` - você pode remover o frontend depois com `--no-view`

### Componentes Principais

#### server/main.ts

```typescript
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { views } from "./views.ts"; // opcional

export type Env = DefaultEnv & DecoEnv & {
  // Bindings adicionais
  ASSETS: { fetch: (...) => Promise<Response> };
};

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [...],        // Permissões necessárias
    state: StateSchema,   // Schema de configuração
  },
  tools,                  // Ferramentas para IA
  views,                  // Rotas da UI (opcional)
  fetch: (req, env) => env.ASSETS.fetch(req), // Fallback
});

export default runtime;
```

#### server/tools/index.ts

```typescript
import { tool1 } from "./tool1.ts";
import { tool2 } from "./tool2.ts";

export const tools = [
  tool1,
  tool2,
];
```

#### server/tools/*.ts

```typescript
import { createTool } from "@decocms/runtime/mastra";
import { z } from "zod";

export const myTool = (env: Env) => createTool({
  id: "MY_TOOL",
  description: "Does something useful",
  inputSchema: z.object({
    param: z.string().describe("A parameter"),
  }),
  execute: async ({ context, input }) => {
    // Implementação
    return { result: "success" };
  },
});
```

---

## Estrutura do Repositório

### Layout Geral

```
mcps/
├── [seus-mcps]/        # Seus MCPs customizados
├── template-minimal/   # Template para API-only
├── template-with-view/ # Template para MCP com UI
├── shared/             # ⭐ Código compartilhado (USE ISTO!)
│   ├── image-generators/  # Framework para geração de imagens
│   ├── video-generators/  # Framework para geração de vídeos
│   ├── storage/           # Abstração de storage universal
│   ├── tools/             # Tools reutilizáveis
│   └── deco-vite-plugin.ts
├── scripts/            # Automação
│   ├── new.ts         # ✅ Criar novo MCP
│   ├── deploy.ts      # Deploy manual
│   └── detect-changed-mcps.ts
├── package.json        # Workspace root
└── README.md
```

### Sistema de Workspaces (Bun)

O monorepo usa **workspaces** do Bun:

**Benefícios:**
- ✅ Dependências compartilhadas (instala uma vez)
- ✅ `bun install` na raiz gerencia tudo
- ✅ Links simbólicos automáticos entre pacotes
- ✅ Imports diretos: `@decocms/mcps-shared/storage`

**Como funciona:**
```json
// package.json na raiz
{
  "workspaces": [
    "seu-mcp-novo",     // ← Adicione aqui se criar manualmente
    "shared",
    "template-*"
  ]
}
```

> 💡 **Importante:** Ao usar `bun run new`, o workspace é configurado automaticamente!

---

## Componentes Compartilhados

O diretório `/shared` contém código reutilizável entre MCPs.

### 1. **image-generators/**

Framework para criar ferramentas de geração de imagens.

**Filosofia:**
- Contrato padrão de input/output
- Middlewares para retry, logging, timeout
- Suporte a múltiplos providers (Gemini, DALL-E, etc.)
- Storage plugável

**Uso:**

```typescript
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";

const tools = createImageGeneratorTools({
  metadata: {
    provider: "Gemini 2.5 Flash",
    description: "Generate images using Gemini",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.CONTRACT,
    clause: { clauseId: "gemini:generateImage", amount: 1 }
  }),
  execute: async ({ env, input }) => {
    // Chama API do provider
    const response = await callGeminiAPI(input.prompt);
    
    // Retorna inline_data (base64)
    return response.inline_data;
  }
});
```

**Schema de Input:**
```typescript
{
  prompt: string;                  // Descrição da imagem
  baseImageUrl?: string;           // Imagem base (image-to-image)
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | 
                "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
}
```

**Schema de Output:**
```typescript
{
  image?: string;         // URL da imagem gerada
  error?: boolean;        // Se houve erro
  finishReason?: string;  // Motivo de conclusão
}
```

**Middlewares:**
- `withRetry`: Retry automático com backoff exponencial
- `withLogging`: Logs com métricas de performance
- `withTimeout`: Timeout para operações
- `withContractManagement`: Billing + retry + logging (tudo em um)

### 2. **video-generators/**

Framework para criar ferramentas de geração de vídeos.

**Diferenças do image-generators:**
- **Streaming-first**: Usa `ReadableStream` (não carrega vídeos na memória)
- **Timeouts maiores**: 6 minutos vs 2 minutos
- **Suporte a operações longas**: Polling automático
- **Input adicional**: duration, referenceImages, firstFrameUrl, lastFrameUrl

**Uso:**

```typescript
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";

const tools = createVideoGeneratorTools({
  metadata: {
    provider: "Veo",
    description: "Generate videos using Veo",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.VEO3_CONTRACT,
    clause: { clauseId: "veo-3:generateVideo", amount: 1 }
  }),
  execute: async ({ env, input }) => {
    // Inicia geração (retorna operation name)
    const operation = await startVideoGeneration(env, input);
    
    // Aguarda conclusão (polling automático)
    const completed = await pollOperation(operation.name);
    
    // Download como stream (eficiente!)
    const videoStream = await downloadVideoAsStream(completed.videoUri);
    
    return {
      data: videoStream,  // ReadableStream
      mimeType: "video/mp4",
      operationName: operation.name
    };
  }
});
```

**Schema de Input:**
```typescript
{
  prompt: string;
  baseImageUrl?: string;
  referenceImages?: Array<{ url: string; referenceType?: "asset" | "style" }>;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  duration?: 4 | 5 | 6 | 7 | 8;  // segundos
  personGeneration?: "dont_allow" | "allow_adult";
  negativePrompt?: string;
}
```

### 3. **storage/**

Abstração unificada para object storage.

**Propósito:** 
- Interface comum para diferentes providers de storage
- Fácil trocar entre S3, R2, FILE_SYSTEM, Supabase, etc.
- Código reutilizável entre MCPs

**Interface Core:**

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

**Adapters disponíveis:**

1. **S3StorageAdapter** - Para qualquer provider S3-compatible
2. **FileSystemStorageAdapter** - Para Deco FILE_SYSTEM

**Factories:**

```typescript
// Auto-detecta (FILE_SYSTEM ou S3 do state)
const storage = createStorageFromEnv(env);

// Do state schema do MCP
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);

// S3 direto
const storage = new S3StorageAdapter({
  region: "us-east-1",
  accessKeyId: "...",
  secretAccessKey: "...",
  bucketName: "my-bucket",
  endpoint: "...", // opcional (R2, MinIO, etc.)
});

// FILE_SYSTEM
const storage = new FileSystemStorageAdapter(env.FILE_SYSTEM);
```

**Providers Suportados:**
- AWS S3
- Cloudflare R2
- Supabase Storage
- MinIO
- DigitalOcean Spaces
- Google Cloud Storage (modo S3)
- Deco FILE_SYSTEM
- Qualquer S3-compatible

### 4. **tools/**

Tools reutilizáveis entre MCPs.

**user.ts:**
- `GET_USER`: Retorna informações do usuário autenticado

```typescript
import { userTools } from "@decocms/mcps-shared/tools/user";

export const tools = [
  ...userTools,
  // suas tools
];
```

### 5. **deco-vite-plugin.ts**

Plugin Vite customizado para build de MCPs Deco.

---

## Como Criar um Novo MCP

### Passo a Passo Completo

```bash
# Com view (React UI)
bun run new my-mcp

# API-only (sem view)
bun run new my-api --no-view

# Minimal template
bun run new my-mcp --template minimal

# Com descrição customizada
bun run new weather-api --no-view --description "Weather forecast API"
```

O script:
1. Copia o template correspondente
2. Renomeia arquivos e atualiza package.json
3. Instala dependências
4. Pronto para `bun run dev`

### Estrutura Inicial

Após criar, você terá:
```
my-mcp/
├── server/
│   ├── main.ts        # Configure scopes e state schema aqui
│   └── tools/
│       └── index.ts   # Adicione suas tools aqui
├── package.json
└── ...
```

### Desenvolvimento

```bash
cd my-mcp
bun install
bun run dev    # Inicia dev server (Vite + Cloudflare Worker)
```

### Adicionar Tools

1. Criar arquivo em `server/tools/my-tool.ts`:

```typescript
import { createTool } from "@decocms/runtime/mastra";
import { z } from "zod";

export const myTool = (env: Env) => createTool({
  id: "MY_TOOL",
  description: "Description for AI agents",
  inputSchema: z.object({
    param1: z.string().describe("Description for param1"),
    param2: z.number().optional().describe("Optional param2"),
  }),
  execute: async ({ context, input }) => {
    // Acesso ao env
    const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
    
    // Acesso aos bindings
    const result = await env.FILE_SYSTEM.write(
      "/path/to/file",
      new Uint8Array()
    );
    
    // Retornar resultado
    return {
      success: true,
      data: result
    };
  },
});
```

2. Exportar em `server/tools/index.ts`:

```typescript
import { myTool } from "./my-tool.ts";

export const tools = [
  myTool,
];
```

### Configurar State Schema

Em `server/main.ts`:

```typescript
import { z } from "zod";

export const StateSchema = BaseStateSchema.extend({
  // Configurações que o usuário preenche ao instalar
  apiKey: z.string().describe("API key for external service"),
  endpoint: z.string().optional().describe("Custom endpoint URL"),
  enableFeatureX: z.boolean().optional().describe("Enable feature X"),
});
```

### Adicionar Scopes (Bindings)

Em `server/main.ts`:

```typescript
const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [
      Scopes.FILE_SYSTEM.FS_WRITE,
      Scopes.FILE_SYSTEM.FS_READ,
      Scopes.MY_CONTRACT.CONTRACT_AUTHORIZE,
      Scopes.MY_CONTRACT.CONTRACT_SETTLE,
    ],
    state: StateSchema,
  },
  tools,
});
```

### Usar Componentes Compartilhados

#### Image Generation:

```typescript
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

export const myImageTools = createImageGeneratorTools({
  metadata: {
    provider: "My Provider",
    description: "Generate images",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.MY_CONTRACT,
    clause: { clauseId: "my-provider:generateImage", amount: 1 }
  }),
  execute: async ({ env, input }) => {
    // Implementar chamada ao provider
    return { inline_data: { data: base64, mimeType: "image/png" } };
  }
});
```

#### Storage:

```typescript
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

export const myTool = (env: Env) => createTool({
  // ...
  execute: async ({ context, input }) => {
    const storage = createStorageFromEnv(env);
    
    // Gerar URL de leitura
    const readUrl = await storage.getReadUrl("/path/to/file.png", 3600);
    
    // Gerar URL de escrita
    const writeUrl = await storage.getWriteUrl("/path/to/file.png", {
      contentType: "image/png",
      expiresIn: 60,
    });
    
    // Upload
    await fetch(writeUrl, {
      method: "PUT",
      body: fileData,
      headers: { "Content-Type": "image/png" }
    });
    
    return { url: readUrl };
  }
});
```

---

## Sistema de Deploy

### Deploy Automático (CI/CD)

O repositório usa **GitHub Actions** com **descoberta automática de MCPs**.

#### Como Funciona:

1. **Descoberta:** Workflow detecta todos os diretórios com `package.json` (exceto `scripts`, `shared`, etc.)
2. **Detecção de Mudanças:** Usa `git diff` para ver quais MCPs mudaram
3. **Deploy Seletivo:** Apenas MCPs modificados são deployados
4. **Execução Paralela:** Múltiplos MCPs são deployados simultaneamente

#### Workflows:

- `.github/workflows/deploy.yml` - Deploy em produção (push to main)
- `.github/workflows/deploy-preview.yml` - Deploy de preview (PRs)

#### Produção (push to main):
- Compara commit atual com anterior
- Deploya MCPs que tiveram mudanças

#### Preview (pull requests):
- Compara branch da PR com main
- Deploya MCPs modificados
- Posta URLs de preview como comentário na PR

### Deploy Manual

```bash
# Produção
bun run scripts/deploy.ts my-mcp

# Preview
bun run scripts/deploy.ts my-mcp --preview
```

O script:
1. Instala dependências do workspace
2. Builda o MCP
3. Remove `wrangler.json` do build (não aceito pela Deco)
4. Faz deploy usando `deco deploy`

### Requisitos

**Por MCP:**
- `package.json` com script `build`
- Build output em `dist/server/`

**Repositório:**
- Secret `DECO_DEPLOY_TOKEN` configurado no GitHub

### Adicionar Novo MCP

Simplesmente crie um diretório com `package.json` - o workflow detecta automaticamente! 🎉

Não precisa:
- ❌ Modificar workflows
- ❌ Adicionar configurações manuais
- ❌ Registrar em lista de MCPs

Precisa:
- ✅ Ter `package.json`
- ✅ Ter script `build`
- ✅ Fazer commit e push

---

## Padrões e Convenções Obrigatórias

### ✅ Estrutura de Diretórios

```
mcp-name/
├── server/           # ✅ OBRIGATÓRIO
│   ├── main.ts      # ✅ OBRIGATÓRIO - Entry point
│   ├── tools/       # ✅ OBRIGATÓRIO
│   │   └── index.ts # ✅ OBRIGATÓRIO - Exporta tools
│   ├── views.ts     # ⚙️ Opcional
│   ├── lib/         # ⚙️ Opcional
│   ├── constants.ts # ⚙️ Opcional
│   └── utils/       # ⚙️ Opcional
├── view/            # ⚙️ Opcional (se tem UI)
│   └── src/
│       ├── main.tsx # ✅ OBRIGATÓRIO (se view/ existe)
│       ├── routes/
│       ├── components/
│       └── hooks/
├── shared/
│   └── deco.gen.ts  # 🤖 AUTO-GERADO
├── package.json     # ✅ OBRIGATÓRIO
├── tsconfig.json    # ✅ OBRIGATÓRIO
├── vite.config.ts   # ✅ OBRIGATÓRIO
└── wrangler.toml    # ✅ OBRIGATÓRIO
```

### ✅ Nomenclatura (Siga Rigorosamente)

**Diretórios e arquivos:**
- `kebab-case`: `my-mcp/`, `my-tool.ts`, `user-button.tsx`

**Tools (IDs):**
- `UPPER_SNAKE_CASE`: `GENERATE_IMAGE`, `LIST_OBJECTS`, `DELETE_FILE`

**Tipos e Interfaces:**
- `PascalCase`: `Env`, `StateSchema`, `MyType`, `UserData`

**Funções e variáveis:**
- `camelCase`: `createClient`, `generateImage`, `myVariable`

**Constantes:**
- `UPPER_SNAKE_CASE`: `API_TIMEOUT`, `MAX_RETRIES`, `DEFAULT_REGION`

### Imports

**Ordem:**
1. External packages
2. `@decocms/*`
3. Shared packages (`@decocms/mcps-shared/*`)
4. Local absolute imports (`server/...`)
5. Relative imports (`./...`, `../...`)

**Exemplo:**
```typescript
// External
import { z } from "zod";
import { S3Client } from "@aws-sdk/client-s3";

// Deco
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { createTool } from "@decocms/runtime/mastra";

// Shared
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

// Local absolute
import type { Env } from "server/main";
import { tools } from "server/tools/index";

// Relative
import { myHelper } from "./utils";
```

### Tipos

**Sempre definir Env:**

```typescript
// server/main.ts
export type Env = DefaultEnv & DecoEnv & {
  // Bindings adicionais
};
```

**Importar Env nos tools:**

```typescript
// server/tools/my-tool.ts
import type { Env } from "server/main";

export const myTool = (env: Env) => { ... };
```

### Error Handling

**Tools devem sempre retornar algo:**

```typescript
execute: async ({ context, input }) => {
  try {
    const result = await doSomething();
    return { success: true, data: result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
```

**Image/Video generators:**

```typescript
return {
  error: true,
  finishReason: "content_filter" | "api_error" | "timeout" | ...
};
```

### Logging

```typescript
// Desenvolvimento
console.log("Debug info:", data);

// Produção (via middlewares)
// withLogging já adiciona logs automáticos
```

### Comentários

**Sempre comentar:**
- Interfaces públicas
- Funções complexas
- Parâmetros não-óbvios
- Decisões de arquitetura

**JSDoc para tools:**

```typescript
/**
 * Generates an image from a text prompt using AI.
 * 
 * @param env - The environment context with bindings
 * @returns A tool that can be called by AI agents
 */
export const generateImage = (env: Env) => { ... };
```

### Testing

**Usar mocks para interfaces:**

```typescript
class MockStorage implements ObjectStorage {
  async getReadUrl(path: string, expiresIn: number) {
    return `mock://read/${path}`;
  }
  async getWriteUrl(path: string, options: any) {
    return `mock://write/${path}`;
  }
}
```

### Package.json

**Scripts obrigatórios:**

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit"
  }
}
```

### Git

**Commits:**
- `feat: add new tool for X`
- `fix: resolve issue with Y`
- `refactor: improve Z structure`
- `docs: update README`
- `chore: update dependencies`

**Branches:**
- `main` - produção
- `feat/feature-name` - novas features
- `fix/bug-name` - bug fixes

---

## Referência Rápida

### Comandos Comuns

```bash
# Setup inicial
bun install

# Criar novo MCP
bun run new <name> [--template minimal|with-view] [--no-view]

# Dev (de dentro do MCP)
cd my-mcp
bun run dev

# Build
bun run build

# Deploy manual
bun run scripts/deploy.ts my-mcp [--preview]

# Lint e format (na raiz)
bun run fmt
bun run lint

# Type check (todos os MCPs)
bun run check

# Clean tudo
bun run clean
```

### Imports Frequentes

```typescript
// Runtime
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { createTool, createPrivateTool } from "@decocms/runtime/mastra";

// Schema
import { z } from "zod";

// Shared - Image
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";

// Shared - Video  
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";

// Shared - Storage
import { 
  createStorageFromEnv,
  createStorageFromState,
  S3StorageAdapter,
  FileSystemStorageAdapter,
  adaptFileSystemBindingToObjectStorage
} from "@decocms/mcps-shared/storage";

// Shared - Tools
import { userTools } from "@decocms/mcps-shared/tools/user";
```

### Estrutura de Tool Básica

```typescript
import { createTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "server/main";

export const myTool = (env: Env) => createTool({
  id: "MY_TOOL",
  description: "What this tool does",
  inputSchema: z.object({
    param: z.string().describe("Description"),
  }),
  execute: async ({ context, input }) => {
    // Acesso ao state
    const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
    
    // Acesso aos bindings
    const result = await env.SOME_BINDING.doSomething();
    
    return { success: true, data: result };
  },
});
```

### Template de State Schema

```typescript
import { z } from "zod";
import { StateSchema as BaseStateSchema } from "../shared/deco.gen.ts";

export const StateSchema = BaseStateSchema.extend({
  // API credentials
  apiKey: z.string().describe("API key"),
  apiSecret: z.string().optional().describe("API secret"),
  
  // Configuration
  endpoint: z.string().optional().describe("Custom endpoint"),
  region: z.string().describe("Region"),
  
  // Feature flags
  enableFeature: z.boolean().optional().describe("Enable feature"),
  
  // Numeric settings
  timeout: z.number().optional().describe("Timeout in seconds"),
});
```

### Scopes Comuns

```typescript
import { Scopes } from "../shared/deco.gen.ts";

scopes: [
  // File system
  Scopes.FILE_SYSTEM.FS_READ,
  Scopes.FILE_SYSTEM.FS_WRITE,
  
  // Contracts
  Scopes.MY_CONTRACT.CONTRACT_AUTHORIZE,
  Scopes.MY_CONTRACT.CONTRACT_SETTLE,
  
  // AI Gateway
  Scopes.AI_GATEWAY.AI_GENERATE,
]
```

### Contract Usage

```typescript
// Authorize
const authorization = await env.MY_CONTRACT.authorize({
  clauseId: "my-provider:action",
  amount: 1,
});

try {
  // Execute action
  const result = await doExpensiveOperation();
  
  // Settle (charge)
  await env.MY_CONTRACT.settle({
    clauseId: "my-provider:action",
    amount: 1,
  });
  
  return result;
} catch (error) {
  // Don't settle on error
  throw error;
}
```

### Storage Quick Start

```typescript
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

// Auto-detect
const storage = createStorageFromEnv(env);

// Get read URL
const url = await storage.getReadUrl("/path/file.png", 3600);

// Get write URL
const writeUrl = await storage.getWriteUrl("/path/file.png", {
  contentType: "image/png",
  expiresIn: 60,
});

// Upload
await fetch(writeUrl, {
  method: "PUT",
  body: fileData,
});
```

### Image Generator Quick Start

```typescript
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

const tools = createImageGeneratorTools({
  metadata: {
    provider: "My Provider",
    description: "Generate images",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.MY_CONTRACT,
    clause: { clauseId: "provider:generateImage", amount: 1 }
  }),
  execute: async ({ env, input }) => {
    const response = await callProviderAPI(input.prompt);
    return response.inline_data; // { data: base64, mimeType: "image/png" }
  }
});
```

### Video Generator Quick Start

```typescript
import { createVideoGeneratorTools } from "@decocms/mcps-shared/video-generators";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

const tools = createVideoGeneratorTools({
  metadata: {
    provider: "My Provider",
    description: "Generate videos",
  },
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  getContract: (env) => ({
    binding: env.MY_CONTRACT,
    clause: { clauseId: "provider:generateVideo", amount: 1 }
  }),
  execute: async ({ env, input }) => {
    const operation = await startVideoGeneration(input.prompt);
    const completed = await pollOperation(operation.name);
    const stream = await downloadVideoStream(completed.videoUri);
    
    return {
      data: stream,  // ReadableStream
      mimeType: "video/mp4",
      operationName: operation.name
    };
  }
});
```

---

## 📚 Documentação Adicional

Para informações mais detalhadas, consulte:

- `/shared/README.md` - Componentes compartilhados
- `/shared/image-generators/README.md` - Framework de image generation
- `/shared/video-generators/README.md` - Framework de video generation
- `/shared/storage/README.md` - Sistema de storage
- `/README.md` - Getting started e deployment

---

## 🎯 Fluxo de Trabalho Típico

### 1. Criar um MCP para Novo Provider de IA

```bash
# 1. Criar estrutura
bun run new my-ai-provider

# 2. Navegar
cd my-ai-provider

# 3. Configurar State Schema
# Editar server/main.ts
export const StateSchema = BaseStateSchema.extend({
  apiKey: z.string().describe("API key for My AI Provider"),
});

# 4. Adicionar scopes
scopes: [
  Scopes.FILE_SYSTEM.FS_WRITE,
  Scopes.FILE_SYSTEM.FS_READ,
]

# 5. Implementar tool usando framework shared
# Editar server/tools/generate.ts
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";
// ... implementar

# 6. Exportar
# Editar server/tools/index.ts
export const tools = [generateImage];

# 7. Dev e testar
bun run dev

# 8. Commit e push
git add .
git commit -m "feat: add my-ai-provider MCP"
git push

# 9. Deploy automático via CI/CD! 🎉
```

### 2. Adicionar Storage Tool

```bash
# 1. Usar template
bun run new storage-manager

# 2. Configurar state com S3
export const StateSchema = BaseStateSchema.extend({
  endpoint: z.string().optional(),
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  bucketName: z.string(),
});

# 3. Usar storage adapter
import { createStorageFromState } from "@decocms/mcps-shared/storage";

export const listFiles = (env: Env) => createTool({
  id: "LIST_FILES",
  // ...
  execute: async () => {
    const storage = createStorageFromState(
      env.DECO_CHAT_REQUEST_CONTEXT.state
    );
    const result = await storage.listObjects({ prefix: "/" });
    return result;
  }
});

# 4. Deploy!
```

### 3. Migrar MCP Existente para Shared Components

```bash
# 1. Identificar código duplicado
# Exemplo: lógica de retry, storage, etc.

# 2. Substituir por componentes shared
# Antes:
const s3Client = new S3Client({ ... });
const url = await getSignedUrl(s3Client, command, { expiresIn });

# Depois:
import { createStorageFromState } from "@decocms/mcps-shared/storage";
const storage = createStorageFromState(env.DECO_CHAT_REQUEST_CONTEXT.state);
const url = await storage.getReadUrl(path, expiresIn);

# 3. Testar
bun run dev

# 4. Commit
git commit -m "refactor: use shared storage adapter"
```

---

---

## Erros Comuns e Como Evitar

### ❌ Erro: Tool não aparece para o agente de IA

**Causas:**
1. Tool não exportada em `server/tools/index.ts`
2. Sintaxe incorreta no `createTool`
3. Schema Zod inválido

**Solução:**
```typescript
// ✅ Correto
// server/tools/my-tool.ts
export const myTool = (env: Env) => createTool({ ... });

// server/tools/index.ts
import { myTool } from "./my-tool.ts";
export const tools = [myTool]; // ← não esqueça!
```

### ❌ Erro: State Schema não aparece no formulário de instalação

**Causas:**
1. `StateSchema` não passado para `withRuntime`
2. Não estendeu `BaseStateSchema`
3. Faltou `.describe()` nos campos

**Solução:**
```typescript
// ✅ Correto
import { StateSchema as BaseStateSchema } from "../shared/deco.gen.ts";

export const StateSchema = BaseStateSchema.extend({
  apiKey: z.string().describe("Sua API key"), // ← describe é obrigatório!
});

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    state: StateSchema, // ← não esqueça!
  },
  // ...
});
```

### ❌ Erro: Binding não está disponível (undefined)

**Causas:**
1. Scope não declarado em `oauth.scopes`
2. Usuário não autorizou o scope
3. Nome do binding errado

**Solução:**
```typescript
// ✅ Correto
import { Scopes } from "../shared/deco.gen.ts";

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [
      Scopes.FILE_SYSTEM.FS_WRITE,  // ← declare TODOS os scopes
      Scopes.FILE_SYSTEM.FS_READ,
    ],
  },
  // ...
});

// Depois pode usar
env.FILE_SYSTEM.write(...);
```

### ❌ Erro: Build falha com "Cannot find module"

**Causas:**
1. Dependência não instalada
2. Import path errado
3. Workspace não configurado

**Solução:**
```bash
# Na raiz do monorepo
bun install

# No MCP específico
cd my-mcp
bun install
bun run build
```

**Imports corretos:**
```typescript
// ✅ Correto
import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";

// ❌ Errado
import { createImageGeneratorTools } from "../../shared/image-generators";
```

### ❌ Erro: Deploy falha com "wrangler.json not found"

**Causa:**
Build não está gerando output em `dist/server/`

**Solução:**
```json
// package.json
{
  "scripts": {
    "build": "vite build" // ← certifique-se que existe
  }
}
```

```typescript
// vite.config.ts - deve usar o plugin Deco
import { decoVitePlugin } from "@decocms/mcps-shared/deco-vite-plugin";

export default defineConfig({
  plugins: [decoVitePlugin()],
});
```

### ❌ Erro: Storage/Contract não funciona

**Causas:**
1. Não usou os helpers corretos
2. State Schema não configurado
3. Scope não autorizado

**Solução para Storage:**
```typescript
// ✅ Correto
import { createStorageFromEnv } from "@decocms/mcps-shared/storage";

const storage = createStorageFromEnv(env);
const url = await storage.getReadUrl("/file.png", 3600);
```

**Solução para Contracts:**
```typescript
// ✅ Correto - sempre authorize → execute → settle
const auth = await env.MY_CONTRACT.authorize({
  clauseId: "action:id",
  amount: 1,
});

try {
  const result = await doAction();
  
  await env.MY_CONTRACT.settle({
    clauseId: "action:id",
    amount: 1,
  });
  
  return result;
} catch (error) {
  // NÃO faça settle em caso de erro!
  throw error;
}
```

### ❌ Erro: Image/Video generator não salva arquivo

**Causas:**
1. Não retornou `inline_data` correto
2. Storage não configurado
3. FILE_SYSTEM sem permissão

**Solução:**
```typescript
// ✅ Correto para image generator
execute: async ({ env, input }) => {
  const response = await callProviderAPI(input.prompt);
  
  // DEVE retornar inline_data
  return {
    inline_data: {
      data: base64String,      // base64 string
      mimeType: "image/png"    // mime type correto
    }
  };
}

// ✅ Correto para video generator
execute: async ({ env, input }) => {
  const videoStream = await getVideoStream();
  
  return {
    data: videoStream,         // ReadableStream
    mimeType: "video/mp4"
  };
}
```

### ❌ Erro: TypeScript reclama de tipos

**Causas:**
1. `deco.gen.ts` desatualizado
2. `Env` não tipado corretamente
3. Import types errado

**Solução:**
```typescript
// ✅ Sempre importe Env como type
import type { Env } from "server/main";

// ✅ Sempre defina Env corretamente
export type Env = DefaultEnv & DecoEnv & {
  ASSETS: { fetch: (...) => Promise<Response> };
};

// ✅ Se deco.gen.ts está desatualizado, rebuild
bun run build
```

### 🎯 Checklist Antes de Fazer Commit

- [ ] `bun run build` funciona sem erros
- [ ] `bun run check` (TypeScript) passa
- [ ] Todos os tools estão exportados em `tools/index.ts`
- [ ] State Schema tem `.describe()` em todos os campos
- [ ] Scopes necessários declarados em `oauth.scopes`
- [ ] Imports usando paths do workspace (`@decocms/mcps-shared/...`)
- [ ] Nomenclatura segue padrões (kebab-case, UPPER_SNAKE_CASE, etc.)
- [ ] Errors são tratados corretamente (try/catch ou return error)
- [ ] README.md atualizado (se necessário)

---

**🎓 Consulte este documento sempre que for criar um novo MCP!**

**Seções mais importantes:**
1. [Estrutura Obrigatória](#estrutura-obrigatória-de-um-mcp) - Como organizar arquivos
2. [Componentes Compartilhados](#componentes-compartilhados) - O que já existe e você pode usar
3. [Como Criar um Novo MCP](#como-criar-um-novo-mcp) - Passo a passo completo
4. [Padrões e Convenções](#padrões-e-convenções-obrigatórias) - Regras que você deve seguir
5. [Erros Comuns](#erros-comuns-e-como-evitar) - Problemas frequentes e soluções

