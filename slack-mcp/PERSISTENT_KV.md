# KV Store Persistente - Solução

## 🔍 Problema Identificado

O servidor MCP do Slack estava perdendo as configurações após reiniciar, causando erro 403 nos webhooks:

```
[Data] ❌ No config found for conn_uY9VI6OVnjY8N_VKKon_f in KV store
[Router] ❌ Connection not found in KV store: conn_uY9VI6OVnjY8N_VKKon_f
```

### Causa Raiz

O KV store original usava **memória volátil** (`Map<string, KVEntry>`), perdendo todos os dados quando:
- ✅ Servidor reinicia (Ctrl+C)
- ✅ Hot reload (`--hot` flag)
- ✅ Crash ou erro no código
- ✅ Deploy de nova versão

### Fluxo do Problema

1. ✅ Usuário salva credenciais no Mesh UI
2. ✅ Mesh envia configuração via `onChange` callback
3. ✅ MCP salva no KV store (memória)
4. ❌ **Servidor reinicia** (perde tudo)
5. ❌ Webhook do Slack chega mas config não existe mais
6. ❌ Retorna 403 Forbidden

## ✅ Solução Implementada

Substituímos o KV store em memória por um **KV store persistente** que salva os dados em disco.

### Mudanças Principais

#### 1. KV Store com Persistência (`server/lib/kv.ts`)

**Antes:**
```typescript
class KVStore {
  private store = new Map<string, KVEntry<unknown>>();
  // ❌ Dados perdidos ao reiniciar
}
```

**Depois:**
```typescript
class KVStore {
  private store = new Map<string, KVEntry<unknown>>();
  private storePath: string; // 💾 Caminho do arquivo
  private saveDebounceTimer: Timer | null = null;
  private isDirty = false;

  async initialize(): Promise<void> {
    // 📂 Carrega dados do disco na inicialização
    const file = Bun.file(this.storePath);
    if (await file.exists()) {
      const data = await file.json();
      this.store = new Map(Object.entries(data));
    }
  }

  private async saveToDisk(): Promise<void> {
    // 💾 Salva dados no disco (debounced)
    const data = Object.fromEntries(this.store.entries());
    await Bun.write(this.storePath, JSON.stringify(data, null, 2));
  }
}
```

#### 2. Inicialização no Main (`server/main.ts`)

```typescript
import { initializeKvStore } from "./lib/kv.ts";

// ✅ Inicializar KV store antes de servir requests
await initializeKvStore("./data/slack-kv.json");

serve(async (req, env, ctx) => {
  // ... rotas
});
```

### Recursos Implementados

✅ **Persistência em Disco** - Dados salvos em `./data/slack-kv.json`
✅ **Debouncing** - Evita writes excessivos (salva após 1s de inatividade)
✅ **Auto-load** - Carrega dados automaticamente na inicialização
✅ **Graceful Shutdown** - Flush para disco no SIGINT/SIGTERM
✅ **TTL Support** - Limpeza automática de entradas expiradas (a cada 5min)
✅ **Error Handling** - Continua funcionando mesmo se falhar ao carregar

### Arquivo de Dados

O arquivo `./data/slack-kv.json` contém todas as configurações:

```json
{
  "slack:connection:conn_uY9VI6OVnjY8N_VKKon_f": {
    "value": {
      "connectionId": "conn_uY9VI6OVnjY8N_VKKon_f",
      "organizationId": "org_xxx",
      "meshUrl": "https://mesh-admin.decocms.com",
      "meshToken": "xxx",
      "botToken": "xoxb-xxx",
      "signingSecret": "xxx",
      "configuredAt": "2026-01-27T20:30:00.000Z"
    }
  }
}
```

## 🔄 Como Funciona Agora

### Primeira Configuração

1. ✅ Usuário salva credenciais no Mesh UI
2. ✅ Mesh envia configuração via `onChange`
3. ✅ MCP salva no KV store (memória + disco)
4. ✅ Arquivo `./data/slack-kv.json` é criado
5. ✅ Webhooks funcionam ✨

### Após Reiniciar

1. ✅ Servidor inicia
2. ✅ KV store carrega dados do arquivo
3. ✅ Todas as configurações disponíveis imediatamente
4. ✅ Webhooks continuam funcionando ✨

### Debouncing

- Alterações no KV marcam como "dirty"
- Timer de 1 segundo é agendado
- Se houver mais alterações, timer é resetado
- Após 1s de inatividade, flush para disco
- Isso evita writes excessivos durante configuração

### Graceful Shutdown

```typescript
process.on("SIGINT", async () => {
  console.log("[KV] 💾 Flushing to disk before shutdown...");
  await kvStore?.flush();
  process.exit(0);
});
```

## 🚀 Como Usar

### Desenvolvedores

Nada muda! O KV store funciona exatamente igual:

```typescript
import { getKvStore } from "./lib/kv.ts";

const kv = getKvStore();
await kv.set("key", { value: "data" });
const data = await kv.get("key");
```

### Deploy

1. ✅ Certifique-se que o diretório `./data/` pode ser escrito
2. ✅ (Opcional) Monte um volume persistente em produção
3. ✅ Arquivo `.gitignore` já configurado para não commitar dados

### Backup

O arquivo `./data/slack-kv.json` pode ser:
- ✅ Copiado para backup
- ✅ Versionado (sem dados sensíveis)
- ✅ Migrado entre ambientes

## 🔒 Segurança

⚠️ **IMPORTANTE**: O arquivo `./data/slack-kv.json` contém:
- 🔐 Tokens do Slack (bot tokens)
- 🔐 Signing secrets
- 🔐 Tokens de API do Mesh

**Proteções:**
- ✅ `.gitignore` configurado para ignorar `data/`
- ✅ Permissões de arquivo devem ser restritas em produção
- ⚠️ Considere criptografar em produção (futuro)

## 📊 Logs

### Inicialização
```
[KV] 🚀 Initializing persistent KV store: ./data/slack-kv.json
[KV] 📂 Loaded 3 entries from disk
[KV] ✅ KV store initialized and ready
```

### Operações
```
[KV] 💾 Saved 3 entries to disk
[KV] 🧹 Cleaned up 2 expired entries
```

### Shutdown
```
[KV] 💾 Flushing to disk before shutdown...
```

## 🎯 Próximos Passos (Opcionais)

### Para Produção

1. **Redis/Valkey** - Usar Redis para melhor performance e multi-instância
2. **Criptografia** - Criptografar dados sensíveis no disco
3. **Backup Automático** - Snapshot periódico do arquivo
4. **Monitoring** - Alertas se save falhar

### Migração para Redis

```typescript
// shared/storage/adapters/redis.ts
export class RedisKVAdapter implements KVStore {
  constructor(private client: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    return await this.client.get(key);
  }
  
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.client.set(key, value, { ex: ttlMs ? ttlMs / 1000 : undefined });
  }
}
```

## ✅ Resultado

Agora o Slack MCP sobrevive a:
- ✅ Reinícios (Ctrl+C + restart)
- ✅ Hot reloads (`--hot`)
- ✅ Crashes
- ✅ Deploys
- ✅ Server restarts

**E o melhor:** as configurações são **persistidas automaticamente** sem intervenção manual! 🎉


