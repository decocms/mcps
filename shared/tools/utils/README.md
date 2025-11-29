# Shared Utilities

Utilitários compartilhados entre todos os MCPs.

## 📦 Módulos Disponíveis

### `api-client.ts`

Funções auxiliares para fazer requisições a APIs externas:

- `assertEnvKey(env, key)` - Valida que uma variável de ambiente existe
- `parseApiError(response, apiName)` - Parseia erros de APIs
- `makeApiRequest(url, options, apiName, responseType?)` - Faz requisição HTTP com tratamento de erro. Suporta diferentes tipos de resposta: "json" (padrão), "text", "blob", "arrayBuffer"
- `pollUntilComplete(options)` - Polling com timeout
- `downloadFile(url)` - Download simples de arquivos (áudio, vídeo, etc.) retornando Blob
- `fetchImageAsBase64(imageUrl)` - Baixa imagem e converte para base64
- `downloadWithAuth(url, authHeaders, apiName)` - Download com autenticação

**Exemplos:**
```typescript
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";

// JSON response (padrão)
const data = await makeApiRequest(
  "https://api.example.com/endpoint",
  {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ prompt: "test" }),
  },
  "Example API"
);

// Text response
const text = await makeApiRequest<string>(
  "https://api.example.com/text-endpoint",
  { method: "GET" },
  "Example API",
  "text"
);

// Blob response
const blob = await makeApiRequest<Blob>(
  "https://api.example.com/file",
  { method: "GET" },
  "Example API",
  "blob"
);
```

### `middleware.ts`

Middlewares reutilizáveis para wrapping de funções assíncronas com retry, logging, timeout, etc.

#### Middlewares Disponíveis

##### `withRetry(maxRetries?)`

Adiciona retry automático com exponential backoff.

**Características:**
- Não faz retry de erros de validação (ZodError)
- Não faz retry de erros 4xx (400, 401, 403, 404)
- Backoff exponencial: 2s, 4s, 8s...

**Exemplo:**
```typescript
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";

const resilientOperation = withRetry(3)(async () => {
  return await apiCall();
});

const result = await resilientOperation();
```

##### `withLogging(options)`

Adiciona logging de performance e erros.

**Opções:**
- `title` - Título para os logs
- `startMessage` - Mensagem customizada de início (opcional)

**Exemplo:**
```typescript
import { withLogging } from "@decocms/mcps-shared/tools/utils/middleware";

const loggedOperation = withLogging({
  title: "Image Analysis",
  startMessage: "Starting analysis...",
})(async () => {
  return await analyzeImage();
});

// Logs:
// [Image Analysis] Starting analysis...
// [Image Analysis] Completed in 1234ms
```

##### `withTimeout(timeoutMs)`

Adiciona timeout para prevenir operações muito longas.

**Exemplo:**
```typescript
import { withTimeout } from "@decocms/mcps-shared/tools/utils/middleware";

const timedOperation = withTimeout(30000)(async () => {
  return await longRunningTask();
});

// Throws: Error: Timeout after 30000ms
```

##### `applyMiddlewares(options)`

Compõe múltiplos middlewares em sequência.

**Exemplo:**
```typescript
import {
  applyMiddlewares,
  withRetry,
  withLogging,
  withTimeout,
} from "@decocms/mcps-shared/tools/utils/middleware";

const robustOperation = applyMiddlewares({
  fn: async () => await apiCall(),
  middlewares: [
    withLogging({ title: "API Call" }),
    withRetry(3),
    withTimeout(60000),
  ],
});

const result = await robustOperation();
```

#### Tipos de Contract

Para sistemas de billing/cobrança:

```typescript
import type { Contract, ContractClause } from "@decocms/mcps-shared/tools/utils/middleware";

interface ContractClause {
  clauseId: string;
  amount: number;
}

interface Contract {
  CONTRACT_AUTHORIZE: (input: {
    clauses: ContractClause[];
  }) => Promise<{ transactionId: string }>;
  
  CONTRACT_SETTLE: (input: {
    transactionId: string;
    clauses: ContractClause[];
    vendorId: string;
  }) => Promise<unknown>;
}
```

## 🎯 Uso em Geradores

### Image Analyzers

```typescript
import {
  withRetry,
  withLogging,
  withTimeout,
  applyMiddlewares,
} from "@decocms/mcps-shared/tools/utils/middleware";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

const withMiddlewares = applyMiddlewares({
  fn: doAnalysis,
  middlewares: [
    withLogging({ title: "Gemini Vision - Analyze" }),
    withRetry(MAX_RETRIES),
    withTimeout(TIMEOUT_MS),
  ],
});
```

### Video Generators

```typescript
import {
  withRetry,
  withLogging,
  withTimeout,
  applyMiddlewares,
} from "@decocms/mcps-shared/tools/utils/middleware";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 360_000; // 6 minutos para vídeo

const withMiddlewares = applyMiddlewares({
  fn: doGeneration,
  middlewares: [
    withLogging({ title: "Sora - Generate" }),
    withRetry(MAX_RETRIES),
    withTimeout(TIMEOUT_MS),
  ],
});
```

## 📁 Estrutura

```
shared/tools/utils/
├── api-client.ts       # Helpers para APIs
├── middleware.ts       # Middlewares reutilizáveis
└── README.md          # Esta documentação
```

## 🔗 Re-exports

Os middlewares são re-exportados em vários lugares para conveniência:

```typescript
// Importação direta (recomendada)
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";

// Ou via geradores
import { withRetry } from "@decocms/mcps-shared/video-generators";
import { withRetry } from "@decocms/mcps-shared/image-generators";
import { withRetry } from "@decocms/mcps-shared/image-analyzers";
```

## 🎨 Padrões de Uso

### Padrão Simples

```typescript
const operation = withRetry(3)(async () => {
  return await apiCall();
});
```

### Padrão Completo

```typescript
const operation = applyMiddlewares({
  fn: async () => await apiCall(),
  middlewares: [
    withLogging({ title: "My Operation" }),
    withRetry(3),
    withTimeout(30000),
  ],
});
```

### Padrão com Contract

```typescript
const doExecute = async () => {
  const { transactionId } = await contract.CONTRACT_AUTHORIZE({
    clauses: [{ clauseId: "operation:run", amount: 1 }],
  });

  try {
    const result = await operation();
    
    await contract.CONTRACT_SETTLE({
      transactionId,
      clauses: [{ clauseId: "operation:run", amount: 1 }],
      vendorId: env.DECO_CHAT_WORKSPACE,
    });
    
    return result;
  } catch (error) {
    // Handle error
    throw error;
  }
};

const withMiddlewares = applyMiddlewares({
  fn: doExecute,
  middlewares: [
    withLogging({ title: "Paid Operation" }),
    withRetry(3),
    withTimeout(60000),
  ],
});
```

## 🧪 Testing

Middlewares podem ser testados isoladamente:

```typescript
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";

// Test retry
let attempts = 0;
const flaky = withRetry(3)(async () => {
  attempts++;
  if (attempts < 3) throw new Error("Flaky");
  return "success";
});

const result = await flaky(); // "success" after 3 attempts
```

## 📚 Referências

- [API Client](./api-client.ts)
- [Middleware](./middleware.ts)
- [Video Generators](../../video-generators/README.md)
- [Image Analyzers](../../image-analyzers/README.md)

