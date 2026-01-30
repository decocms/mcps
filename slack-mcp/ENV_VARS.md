# 🔧 Variáveis de Ambiente - Slack MCP

## 🎯 Variáveis Necessárias

### Supabase (Recomendado)

```bash
# Obtenha em: https://supabase.com → Settings → API
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Como obter:**
1. Supabase Dashboard → Settings → API
2. Copie "Project URL" → `SUPABASE_URL`
3. Copie "anon public" key → `SUPABASE_ANON_KEY`

---

### Server (Opcional)

```bash
# Porta do servidor (default: 8080)
PORT=8080

# Ambiente (default: production)
NODE_ENV=production

# URL pública para servir arquivos
SERVER_PUBLIC_URL=https://slack-mcp.your-domain.com
```

---

### Redis (Alternativa ao Supabase)

```bash
# Se preferir Redis ao invés de Supabase
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password
REDIS_DB=0
REDIS_KEY_PREFIX=slack-mcp:
REDIS_TTL_SECONDS=86400
```

---

## 🚀 Exemplos de Uso

### Local Development

```bash
# .env file
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3003
```

```bash
# Start
cd /Users/jonasjesus/Documents/decocms/mcps/slack-mcp
bun run dev
```

### Com deco link

```bash
export SUPABASE_URL="https://xxxxxxxxxxxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
bun run dev:link
```

### Docker Compose

```yaml
services:
  slack-mcp:
    image: slack-mcp:latest
    ports:
      - "8080:8080"
    environment:
      SUPABASE_URL: https://xxxxxxxxxxxxx.supabase.co
      SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
      PORT: 8080
```

### Kubernetes Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: slack-mcp-env
type: Opaque
stringData:
  SUPABASE_URL: https://xxxxxxxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slack-mcp
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: slack-mcp
        image: slack-mcp:latest
        envFrom:
        - secretRef:
            name: slack-mcp-env
```

---

## ✅ Prioridade de Storage

O sistema detecta automaticamente:

1. **Supabase** (se `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão definidos)
2. **Redis** (se `REDIS_URL` está definido)
3. **KV Store** (fallback automático - arquivo local)

---

## 🔒 Segurança

- ✅ Nunca commite `.env` no git (já está no `.gitignore`)
- ✅ Use Kubernetes Secrets em produção
- ✅ `SUPABASE_ANON_KEY` é pública (pode expor)
- ✅ Row Level Security (RLS) para segurança extra

---

## 🎯 Minimal Setup

Para funcionar, você só precisa:

```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Tudo mais é opcional!

