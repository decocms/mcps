# 🚀 Supabase Setup Simples - Slack MCP

## ⚡ Setup em 3 Passos (5 minutos)

### 1. Criar Projeto no Supabase

1. Acesse https://supabase.com
2. Faça login (GitHub ou Google)
3. Clique em "New Project"
4. Preencha:
   - **Name**: `slack-mcp` (ou qualquer nome)
   - **Database Password**: Gere senha forte (não precisa guardar!)
   - **Region**: `South America (São Paulo)` - sa-east-1
   - **Pricing**: Free
5. Clique em "Create new project"
6. Aguarde ~2 minutos

### 2. Criar Tabela (SQL Editor)

1. No projeto, clique em **SQL Editor** na barra lateral
2. Cole este SQL:

```sql
CREATE TABLE slack_connections (
  connection_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mesh_url TEXT NOT NULL,
  mesh_token TEXT,
  model_provider_id TEXT,
  model_id TEXT,
  agent_id TEXT,
  system_prompt TEXT,
  bot_token TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  team_id TEXT,
  bot_user_id TEXT,
  configured_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_slack_connections_team_id ON slack_connections(team_id);
CREATE INDEX idx_slack_connections_organization_id ON slack_connections(organization_id);
CREATE INDEX idx_slack_connections_updated_at ON slack_connections(updated_at);
```

3. Clique em "Run" ou pressione `Ctrl+Enter`
4. Deve ver: "Success. No rows returned"

### 3. Copiar Credenciais

1. No projeto, clique em **Settings** (⚙️) > **API**
2. Copie os dois valores:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```

**anon/public key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN...
```

### 4. Configurar no Slack MCP

Adicione no arquivo `.env`:

```bash
# /Users/jonasjesus/Documents/decocms/mcps/slack-mcp/.env

SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3...
```

Ou exporte no terminal:

```bash
export SUPABASE_URL="https://xxxxxxxxxxxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3..."
```

### 5. Testar

```bash
cd /Users/jonasjesus/Documents/decocms/mcps/slack-mcp
bun run dev
```

**Deve ver:**
```
[Supabase] ✅ Client initialized successfully
[Storage] Using Supabase for config persistence (multi-pod ready)
[ConfigCache] Initialized count from Supabase: 0 configs
```

---

## ✅ Pronto!

Agora o Slack MCP vai salvar todas as configurações no Supabase automaticamente. Funciona em:
- ✅ Local com `deco link`
- ✅ Deploy produção
- ✅ Múltiplos pods no Kubernetes

---

## 🔍 Ver Dados Salvos

1. No Supabase, vá em **Table Editor**
2. Clique em `slack_connections`
3. Veja todas as configurações!

---

## 💰 Custo

**$0/mês** - Supabase Free Tier:
- 500MB storage
- 500MB bandwidth/mês
- Unlimited API requests
- Backup diário (7 dias)

---

## 🆘 Problemas?

### Erro: "Failed to initialize client"
- Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão corretos
- Teste no browser: abra SUPABASE_URL (deve abrir página do Supabase)

### Erro: "relation slack_connections does not exist"
- Execute o SQL do passo 2 novamente no SQL Editor

### Configs não aparecem
- Verifique logs: `[Supabase] 💾 Saved connection config`
- Abra Table Editor e veja se tem dados

---

## 📚 Mais Info

- Dashboard: https://supabase.com/dashboard
- Docs: https://supabase.com/docs
- Status: https://status.supabase.com

