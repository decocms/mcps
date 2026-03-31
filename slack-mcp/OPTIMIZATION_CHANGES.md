# Mudanças de Otimização - Slack MCP

## 📋 Resumo das Mudanças

Este documento descreve as otimizações implementadas no Slack MCP para melhorar a confiabilidade, reduzir o uso de recursos e simplificar a arquitetura em produção.

**Data:** 28 de Janeiro de 2026

---

## ✅ 1. Remoção do DATABASE Binding

### Problema

O binding `DATABASE` estava declarado no `StateSchema` mas nunca era utilizado pelo código (0 referências encontradas).

### Solução

Removido o binding não utilizado do schema de configuração.

**Arquivo modificado:** `server/types/env.ts`

```typescript
// ANTES
export const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus").optional(),
  DATABASE: BindingOf("@deco/postgres").optional(), // ❌ Nunca usado
  MODEL_PROVIDER: BindingOf("@deco/llm")...
});

// DEPOIS
export const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus").optional(),
  MODEL_PROVIDER: BindingOf("@deco/llm")... // ✅ Mais limpo
});
```

### Impacto

- ✅ Schema mais limpo e fácil de entender
- ✅ Menos confusão para desenvolvedores
- ✅ Interface de configuração do Mesh simplificada

---

## ✅ 2. Correção de Memory Leak no API Key Manager

### Problema

O `Map` de API keys persistentes crescia indefinidamente sem limpeza, causando:

- Memory leak em servidores long-running
- API keys perdidas após restart (não sobreviviam a reinícios)

### Solução

Implementadas duas novas funções:

#### 2.1. `loadApiKeyFromKV`

Carrega API keys do KV store após restart do servidor.

```typescript
export async function loadApiKeyFromKV(
  connectionId: string,
  getConfigFn: (id: string) => Promise<{ meshToken?: string } | null>,
): Promise<string | null> {
  // 1. Verifica cache em memória
  const cached = persistentApiKeys.get(connectionId);
  if (cached) return cached;

  // 2. Tenta carregar do KV (sobrevive a restarts)
  const config = await getConfigFn(connectionId);
  if (config?.meshToken) {
    persistentApiKeys.set(connectionId, config.meshToken);
    console.log(`[API-KEY] Loaded from KV for ${connectionId}`);
    return config.meshToken;
  }

  return null;
}
```

#### 2.2. `cleanupOrphanedKeys`

Remove API keys de conexões que não existem mais (cleanup periódico).

```typescript
export async function cleanupOrphanedKeys(
  getConfigFn: (id: string) => Promise<any | null>,
): Promise<number> {
  let cleaned = 0;
  for (const [connectionId] of persistentApiKeys) {
    const config = await getConfigFn(connectionId);
    if (!config) {
      persistentApiKeys.delete(connectionId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[API-KEY] Cleaned ${cleaned} orphaned keys`);
  }
  return cleaned;
}
```

#### 2.3. Integração no `main.ts`

```typescript
// Tenta carregar API key do KV primeiro (survive restarts)
let apiKey = await loadApiKeyFromKV(connectionId, readConnectionConfig);

// Se não encontrada, cria uma nova
if (!apiKey) {
  apiKey = await getOrCreatePersistentApiKey({
    meshUrl,
    organizationId,
    connectionId,
    temporaryToken,
  });
}

// Cleanup periódico a cada 1 hora
setInterval(
  async () => {
    console.log("[API-KEY] Running periodic cleanup...");
    await cleanupOrphanedKeys(readConnectionConfig);
  },
  60 * 60 * 1000,
);
```

**Arquivos modificados:**

- `shared/api-key-manager.ts` - Novas funções
- `slack-mcp/server/main.ts` - Integração e cleanup

### Impacto

- ✅ API keys sobrevivem a restarts (recovery automático)
- ✅ Memory leak corrigido (cleanup periódico)
- ✅ Mais confiável em produção

---

## ✅ 3. Otimização do KV Store Cleanup

### Problema

- Cleanup rodava a cada 5 minutos (muitos I/O)
- Sem limite máximo de entradas (risco de crescimento infinito)
- Logs sem métricas úteis

### Solução

#### 3.1. Intervalo Aumentado

```typescript
// ANTES
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutos

// DEPOIS
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutos (-66% I/O)
```

#### 3.2. Limite Máximo com Alertas

```typescript
const MAX_ENTRIES = 10_000; // Limite recomendado

async cleanup(): Promise<number> {
  // ... limpeza de expirados ...

  // Verifica limite
  const sizeAfter = this.store.size;
  if (sizeAfter > MAX_ENTRIES) {
    console.warn(
      `[KV] ⚠️ Store size (${sizeAfter}) exceeds recommended limit (${MAX_ENTRIES}). ` +
      `Consider adjusting TTLs or archiving old data.`
    );
  }

  // Log com métricas
  if (cleaned > 0) {
    console.log(
      `[KV] 🧹 Cleanup: ${cleaned} expired entries removed (${sizeBefore} → ${sizeAfter})`
    );
  }

  return cleaned;
}
```

#### 3.3. Função para Monitoramento

```typescript
export function getKvStoreSize(): number {
  return kvStore?.getSize() ?? 0;
}
```

**Arquivo modificado:** `server/lib/kv.ts`

### Impacto

- ✅ -66% de operações de I/O (15min vs 5min)
- ✅ Alertas quando limite é excedido
- ✅ Métricas detalhadas no cleanup
- ✅ Função exposta para health check

---

## ✅ 4. Simplificação do EVENT_BUS

### Problema

O `EVENT_BUS` binding estava sendo usado **incorretamente** como fallback quando o LLM não estava configurado, enviando eventos que nunca eram consumidos.

### Solução

#### 4.1. Mantido no Schema (Opcional)

```typescript
// MANTIDO para usos legítimos (reações, canais, etc.)
EVENT_BUS: BindingOf("@deco/event-bus").optional();
```

#### 4.2. Removido Uso Incorreto

Substituídas 3 chamadas de `publishToEventBus()` (fallback) por mensagens amigáveis:

```typescript
// ANTES
if (!isLLMConfigured()) {
  await publishToEventBus(
    SLACK_EVENT_TYPES.OPERATOR_GENERATE,
    messages,
    { channel, threadTs, messageTs, userId },
    meshConfig,
  );
  return;
}

// DEPOIS
if (!isLLMConfigured()) {
  const warningMsg =
    "⚠️ Por favor, configure um LLM (Language Model) no Mesh para usar o bot.\n\n" +
    "Acesse as configurações da conexão no Mesh e selecione um provedor de modelo (como OpenAI, Anthropic, etc.).";

  await replyInThread(channel, threadTs, warningMsg);

  // Deleta mensagem de "pensando..." se existir
  if (thinkingMsg?.ts) {
    await deleteMessage(channel, thinkingMsg.ts);
  }

  console.log("[EventHandler] LLM not configured - sent configuration warning");
  return;
}
```

#### 4.3. Removida Função `publishToEventBus`

A função de fallback foi completamente removida do código.

**Arquivos modificados:**

- `server/slack/handlers/eventHandler.ts` - 3 substituições + função removida

**Mantido:**

- `server/events.ts` - Ainda usado para eventos legítimos (reações, canais criados, etc.)
- `EVENT_BUS` binding - Opcional no schema para usos futuros

### Impacto

- ✅ UX melhorado: mensagens claras quando LLM não configurado
- ✅ Menos eventos inúteis no Event Bus
- ✅ Código mais limpo e fácil de entender
- ✅ EVENT_BUS disponível para usos legítimos

---

## ✅ 5. Health Check Endpoint

### Problema

Sem endpoint de monitoramento para Kubernetes/produção, dificultando:

- Liveness probes
- Readiness probes
- Debugging de problemas em produção

### Solução

Criado endpoint `/health` com métricas do sistema.

#### 5.1. Nova Função de Health Status

**Arquivo:** `server/health.ts`

```typescript
export async function getHealthStatus(): Promise<HealthStatus> {
  const kvHealthy = await checkKvHealth();
  const memUsage = process.memoryUsage();

  return {
    status: kvHealthy ? "ok" : "degraded",
    uptime: process.uptime(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    },
    metrics: {
      apiKeysCount: getApiKeysCount(),
      kvStoreSize: getKvStoreSize(),
    },
    database: {
      connected: kvHealthy,
      type: "kv-store-local",
    },
  };
}
```

#### 5.2. Rota Atualizada

**Arquivo:** `server/router.ts`

```typescript
// ANTES
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "slack-mcp" });
});

// DEPOIS
app.get("/health", async (c) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "ok" ? 200 : 503;
  return c.json(health, statusCode);
});
```

#### 5.3. Exemplo de Resposta

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "memory": {
    "heapUsed": 45678912,
    "heapTotal": 67108864,
    "external": 1234567,
    "rss": 89012345
  },
  "metrics": {
    "apiKeysCount": 3,
    "kvStoreSize": 15
  },
  "database": {
    "connected": true,
    "type": "kv-store-local"
  }
}
```

**Arquivos criados/modificados:**

- `server/health.ts` - Novo arquivo
- `server/router.ts` - Rota atualizada

### Impacto

- ✅ Kubernetes liveness/readiness probes
- ✅ Monitoramento de memória e recursos
- ✅ Visibilidade do estado do sistema
- ✅ HTTP 503 quando degraded (K8s restart automático)

---

## 📊 Resumo do Impacto

| Métrica                | Antes                  | Depois               | Melhoria          |
| ---------------------- | ---------------------- | -------------------- | ----------------- |
| **Bindings no Schema** | 6                      | 5                    | -16% (mais limpo) |
| **API Key recovery**   | ❌ Perde no restart    | ✅ Recarrega do KV   | Confiável         |
| **Memory leak risk**   | ⚠️ Alto (Map infinito) | ✅ Baixo (cleanup)   | Estável           |
| **KV cleanup I/O**     | A cada 5min            | A cada 15min         | -66% I/O          |
| **EVENT_BUS fallback** | ❌ Eventos inúteis     | ✅ Mensagens claras  | UX melhor         |
| **Health monitoring**  | ❌ Nenhum              | ✅ Endpoint completo | Observabilidade   |
| **Alertas**            | ❌ Nenhum              | ✅ KV size limit     | Proativo          |

---

## 🔄 Como Testar

### 1. API Key Recovery

```bash
# Terminal 1: Inicie o servidor
bun run dev

# Terminal 2: Configure uma conexão no Mesh UI
# Aguarde configuração ser salva

# Terminal 1: Ctrl+C e reinicie
bun run dev

# Resultado: API key deve ser recarregada automaticamente
# Log esperado: [API-KEY] Loaded from KV for conn_xxx
```

### 2. KV Cleanup

```bash
# Verifique logs a cada 15 minutos
[KV] 🧹 Cleanup: 2 expired entries removed (150 → 148)

# Teste limite máximo (adicione 10k+ entradas)
[KV] ⚠️ Store size (10001) exceeds recommended limit (10000). Consider adjusting TTLs or archiving old data.
```

### 3. EVENT_BUS (LLM não configurado)

```
Usuário: @bot olá
Bot: ⚠️ Por favor, configure um LLM (Language Model) no Mesh para usar o bot.

Acesse as configurações da conexão no Mesh e selecione um provedor de modelo (como OpenAI, Anthropic, etc.).
```

### 4. Health Check

```bash
curl http://localhost:3003/health

# Resposta esperada (status 200):
{
  "status": "ok",
  "uptime": 123.45,
  "metrics": {
    "apiKeysCount": 2,
    "kvStoreSize": 8
  }
}
```

### 5. API Key Cleanup

```bash
# Aguarde 1 hora ou force:
# (Deletar config de uma conexão e esperar cleanup)

# Log esperado:
[API-KEY] Running periodic cleanup...
[API-KEY] Cleaned 1 orphaned keys
```

---

## 🚀 Deploy em Produção

### Kubernetes Probes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slack-mcp
spec:
  template:
    spec:
      containers:
        - name: slack-mcp
          image: slack-mcp:latest
          livenessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 5
            periodSeconds: 10
```

### Monitoramento Recomendado

1. **Health endpoint**: Monitor status != "ok"
2. **KV size**: Alert quando > 9000 (90% do limite)
3. **API Keys**: Alert se count > 100 (possível leak)
4. **Memory**: Alert se rss > 500MB (memory leak)
5. **Cleanup logs**: Alert se cleanup falhar por 3x consecutivas

---

## 📝 Próximos Passos (Opcional)

### Curto Prazo

- [ ] Adicionar rate limiting no health endpoint
- [ ] Expor métricas Prometheus (`/metrics`)
- [ ] Adicionar traces OpenTelemetry

### Longo Prazo

- [ ] Migrar KV Store para PostgreSQL (multi-pod K8s)
- [ ] Implementar Redis cache (30s TTL) para reads
- [ ] Adicionar criptografia de dados no KV store
- [ ] Implementar backup automático do KV store

---

## ✅ Conclusão

Todas as mudanças do plano de otimização foram implementadas com sucesso:

1. ✅ DATABASE binding removido
2. ✅ API Key Manager corrigido (recovery + cleanup)
3. ✅ KV Store otimizado (intervalo + limite + métricas)
4. ✅ EVENT_BUS simplificado (fallback removido, mantido para usos legítimos)
5. ✅ Health Check endpoint criado

O Slack MCP agora está mais **confiável**, **eficiente** e **observável** em produção! 🎉
