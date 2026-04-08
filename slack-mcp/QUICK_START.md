# ⚡ Quick Start - Supabase com URL + ANON_KEY

## 🎯 Setup Completo em 5 Minutos

### 1. Criar Projeto Supabase

```
1. https://supabase.com → Login → New Project
2. Name: slack-mcp | Region: South America | Free
3. Aguarde 2 min
```

### 2. Criar Tabela

```
SQL Editor → Cole e Execute:
```

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

CREATE INDEX idx_slack_connections_team_id ON slack_connections(team_id);
CREATE INDEX idx_slack_connections_organization_id ON slack_connections(organization_id);
CREATE INDEX idx_slack_connections_updated_at ON slack_connections(updated_at);
```

### 3. Copiar Credenciais

```
Settings → API → Copie:

✅ Project URL: https://xxxxx.supabase.co
✅ anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Configurar

```bash
# Cole no .env
echo 'SUPABASE_URL=https://xxxxx.supabase.co' >> /Users/jonasjesus/Documents/decocms/mcps/slack-mcp/.env
echo 'SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' >> /Users/jonasjesus/Documents/decocms/mcps/slack-mcp/.env
```

### 5. Rodar

```bash
cd /Users/jonasjesus/Documents/decocms/mcps/slack-mcp
bun run dev
```

**Deve ver:**

```
[Supabase] ✅ Client initialized successfully
[Storage] Using Supabase for config persistence (multi-pod ready)
```

---

## ✅ Pronto!

- ✅ Configs persistem entre deploys
- ✅ Múltiplos pods compartilham dados
- ✅ Refresh tokens não se perdem
- ✅ $0/mês (free tier)
- ✅ Funciona com `deco link`

---

## 🔍 Ver Dados

```
Supabase Dashboard → Table Editor → slack_connections
```

---

## 📖 Docs Completas

- `SUPABASE_SETUP_SIMPLE.md` - Setup detalhado
- `ENV_VARS.md` - Todas as variáveis de ambiente
