# 🚀 Supabase Setup - Discord MCP

## ⚡ Setup em 3 Passos (5 minutos)

### 1. Criar Projeto no Supabase

1. Acesse https://supabase.com
2. Faça login (GitHub ou Google)
3. Clique em "New Project"
4. Preencha:
   - **Name**: `discord-mcp` (ou qualquer nome)
   - **Database Password**: Gere senha forte (não precisa guardar!)
   - **Region**: `South America (São Paulo)` - sa-east-1
   - **Pricing**: Free
5. Clique em "Create new project"
6. Aguarde ~2 minutos

### 2. Criar Tabelas (SQL Editor)

1. No projeto, clique em **SQL Editor** na barra lateral
2. Cole este SQL:

```sql
-- Tabela de mensagens do Discord
CREATE TABLE IF NOT EXISTS discord_message (
  id TEXT PRIMARY KEY,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  channel_type INTEGER,
  parent_channel_id TEXT,
  thread_id TEXT,
  is_dm BOOLEAN DEFAULT FALSE,
  
  -- Author info
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_global_name TEXT,
  author_avatar TEXT,
  author_bot BOOLEAN DEFAULT FALSE,
  
  -- Content
  content TEXT,
  content_clean TEXT,
  
  -- Metadata
  type INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  tts BOOLEAN DEFAULT FALSE,
  flags INTEGER DEFAULT 0,
  
  -- Webhook/Application/Interaction
  webhook_id TEXT,
  application_id TEXT,
  interaction JSONB,
  
  -- Mentions
  mention_everyone BOOLEAN DEFAULT FALSE,
  mention_users JSONB,
  mention_roles JSONB,
  mention_channels JSONB,
  
  -- Attachments and embeds
  attachments JSONB,
  embeds JSONB,
  stickers JSONB,
  components JSONB,
  
  -- Reply/Thread/Reference
  reply_to_id TEXT,
  message_reference JSONB,
  
  -- Edit tracking
  edit_history JSONB,
  
  -- Delete tracking
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT,
  deleted_by_username TEXT,
  bulk_deleted BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  edited_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_discord_message_guild ON discord_message(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_channel ON discord_message(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_author ON discord_message(author_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_created ON discord_message(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_message_thread ON discord_message(thread_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_reply ON discord_message(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_deleted ON discord_message(deleted, deleted_at DESC);

-- Tabela de reações
CREATE TABLE IF NOT EXISTS discord_reaction (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji_name TEXT NOT NULL,
  emoji_id TEXT,
  emoji_animated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji_name)
);

CREATE INDEX IF NOT EXISTS idx_discord_reaction_message ON discord_reaction(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_reaction_user ON discord_reaction(user_id);
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

### 4. Configurar no Discord MCP

Adicione no arquivo `.env`:

```bash
# /Users/jonasjesus/Documents/decocms/mcps/discord-read/.env

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
cd /Users/jonasjesus/Documents/decocms/mcps/discord-read
bun run dev
```

**Deve ver:**
```
[Supabase] ✅ Client initialized successfully
[Discord] Connected as YourBot#1234
[Database] Using Supabase for message indexing
```

---

## ✅ Pronto!

Agora o Discord MCP vai salvar todas as mensagens no Supabase automaticamente. Funciona em:
- ✅ Local com `deco link`
- ✅ Deploy produção
- ✅ Múltiplos pods no Kubernetes

---

## 🔍 Ver Dados Salvos

1. No Supabase, vá em **Table Editor**
2. Clique em `discord_message`
3. Veja todas as mensagens indexadas!

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

### Erro: "relation discord_message does not exist"
- Execute o SQL do passo 2 novamente no SQL Editor

### Mensagens não aparecem
- Verifique logs: `[Supabase] Inserting message`
- Abra Table Editor e veja se tem dados

---

## 📚 Mais Info

- Dashboard: https://supabase.com/dashboard
- Docs: https://supabase.com/docs
- Status: https://status.supabase.com

