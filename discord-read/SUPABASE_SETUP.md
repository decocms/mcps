# Configuração do Supabase para Discord MCP

## 🎯 Migração do Binding DATABASE para Supabase

O Discord MCP foi migrado do binding `DATABASE: "@deco/postgres"` para usar **Supabase diretamente** via `@supabase/supabase-js`.

### ❌ Problema Anterior

```typescript
// ❌ Tentava usar o binding DATABASE que não está disponível no contexto
await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
  sql,
  params,
});
// Error: Connection context required for database access
```

### ✅ Solução Atual

```typescript
// ✅ Usa Supabase diretamente
import { getSupabaseClient } from "./server/lib/supabase-client.ts";

const client = getSupabaseClient();
await client.from("guilds").select("*").eq("id", guildId);
```

## 📋 Configuração

### 1. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Aguarde a criação do banco de dados

### 2. Obter Credenciais

No dashboard do Supabase:
- Settings > API
- Copie a `URL` e a `anon public` key

### 3. Configurar Variáveis de Ambiente

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-aqui
```

### 4. Criar Tabelas no Supabase

Execute o SQL no Supabase SQL Editor:

```sql
-- Discord connections table (stores bot configurations)
CREATE TABLE IF NOT EXISTS discord_connections (
  connection_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mesh_url TEXT NOT NULL,
  mesh_token TEXT,
  model_provider_id TEXT,
  model_id TEXT,
  agent_id TEXT,
  system_prompt TEXT,
  bot_token TEXT NOT NULL,
  authorized_guilds TEXT[], -- Array of guild IDs that can use this bot
  owner_id TEXT, -- Discord user ID of bot owner
  command_prefix TEXT DEFAULT '!' NOT NULL,
  configured_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_connections_org ON discord_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_discord_connections_updated ON discord_connections(updated_at DESC);

-- Guilds table
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  owner_id TEXT,
  command_prefix TEXT DEFAULT '!',
  log_channel_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guilds_owner ON guilds(owner_id);

-- Discord messages table
CREATE TABLE IF NOT EXISTS discord_message (
  id TEXT PRIMARY KEY,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  channel_type INTEGER,
  parent_channel_id TEXT,
  thread_id TEXT,
  is_dm BOOLEAN DEFAULT FALSE,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_global_name TEXT,
  author_avatar TEXT,
  author_bot BOOLEAN DEFAULT FALSE,
  content TEXT,
  content_clean TEXT,
  type INTEGER NOT NULL,
  pinned BOOLEAN DEFAULT FALSE,
  tts BOOLEAN DEFAULT FALSE,
  flags INTEGER DEFAULT 0,
  webhook_id TEXT,
  application_id TEXT,
  interaction JSONB,
  mention_everyone BOOLEAN DEFAULT FALSE,
  mention_users JSONB,
  mention_roles JSONB,
  mention_channels JSONB,
  attachments JSONB,
  embeds JSONB,
  stickers JSONB,
  components JSONB,
  reply_to_id TEXT,
  message_reference JSONB,
  edit_history JSONB,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT,
  deleted_by_username TEXT,
  bulk_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  edited_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_message_channel ON discord_message(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_author ON discord_message(author_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_guild ON discord_message(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_message_created ON discord_message(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_message_deleted ON discord_message(deleted);

-- Discord channels table
CREATE TABLE IF NOT EXISTS discord_channel (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type INTEGER NOT NULL,
  position INTEGER,
  parent_id TEXT,
  category_name TEXT,
  owner_id TEXT,
  message_count INTEGER,
  member_count INTEGER,
  topic TEXT,
  nsfw BOOLEAN DEFAULT FALSE,
  rate_limit_per_user INTEGER,
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  auto_archive_duration INTEGER,
  locked BOOLEAN DEFAULT FALSE,
  permission_overwrites JSONB,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_channel_guild ON discord_channel(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_parent ON discord_channel(parent_id);

-- Discord members table
CREATE TABLE IF NOT EXISTS discord_member (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  global_name TEXT,
  avatar TEXT,
  bot BOOLEAN DEFAULT FALSE,
  nickname TEXT,
  display_avatar TEXT,
  roles JSONB,
  permissions TEXT,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  is_member BOOLEAN DEFAULT TRUE,
  timed_out_until TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_member_user ON discord_member(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_member_is_member ON discord_member(is_member);

-- Discord message reactions table
CREATE TABLE IF NOT EXISTS discord_message_reaction (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id TEXT NOT NULL,
  emoji_id TEXT DEFAULT '',
  emoji_name TEXT NOT NULL,
  emoji_animated BOOLEAN DEFAULT FALSE,
  count INTEGER DEFAULT 0,
  count_burst INTEGER DEFAULT 0,
  count_normal INTEGER DEFAULT 0,
  user_ids JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, emoji_id, emoji_name)
);

CREATE INDEX IF NOT EXISTS idx_discord_message_reaction_msg ON discord_message_reaction(message_id);

-- Discord channel context (custom prompts per channel)
CREATE TABLE IF NOT EXISTS discord_channel_context (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  system_prompt TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id TEXT NOT NULL,
  created_by_username TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_channel_context_enabled ON discord_channel_context(enabled);
```

## 🔄 Status da Migração

### ✅ Concluído
- [x] Cliente Supabase criado (`server/lib/supabase-client.ts`)
- [x] Dependência `@supabase/supabase-js` adicionada
- [x] Binding `DATABASE` removido do `app.json`
- [x] Scope `DATABASE::DATABASES_RUN_SQL` removido
- [x] Referências ao binding removidas do código
- [x] Sistema de configuração criado (`server/lib/config-cache.ts`)
- [x] Tools de configuração criadas (`server/tools/config.ts`)
- [x] Cache de configuração com TTL de 30s
- [x] Suporte a guilds autorizados

### 🎯 Recursos de Configuração

O Discord MCP agora suporta **salvar configurações no Supabase**, similar ao Slack MCP:

#### Tools Disponíveis

1. **`DISCORD_SAVE_CONFIG`** - Salva configuração do bot
   - Token do Discord
   - Guilds autorizados (opcional)
   - Owner ID (opcional)
   - Prefixo de comando
   - Configurações de IA (modelo, agente, prompt)

2. **`DISCORD_LOAD_CONFIG`** - Carrega configuração salva

3. **`DISCORD_DELETE_CONFIG`** - Remove configuração

4. **`DISCORD_CONFIG_CACHE_STATS`** - Estatísticas do cache

5. **`DISCORD_CONFIG_CLEAR_CACHE`** - Limpa cache

#### Como Usar

```typescript
// 1. Salvar configuração (primeira vez)
await DISCORD_SAVE_CONFIG({
  botToken: "seu-token-aqui",
  authorizedGuilds: ["123456789", "987654321"], // opcional
  ownerId: "your-discord-user-id", // opcional
  commandPrefix: "!",
  modelProviderId: "openai-connection-id",
  modelId: "gpt-4",
  systemPrompt: "You are a helpful Discord bot..."
});

// 2. Carregar configuração (próximas vezes)
const config = await DISCORD_LOAD_CONFIG({});
// Retorna: { botToken, authorizedGuilds, ownerId, ... }

// 3. Usar o bot sem precisar passar token novamente!
```

### ⚠️ Pendente
- [ ] Integrar configuração salva com bot-manager
- [ ] Auto-carregar configuração na inicialização
- [ ] Validar guilds autorizados antes de responder comandos
- [ ] Adicionar webhook de configuração (opcional)

## 📝 Próximos Passos

### Para Usar SQL Direto (Recomendado para PostgreSQL)

Criar uma função RPC no Supabase:

```sql
CREATE OR REPLACE FUNCTION exec_sql(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE query INTO result USING params;
  RETURN result;
END;
$$;
```

### Ou Migrar para Operações de Tabela (Recomendado)

```typescript
// Em vez de:
await runSQL("SELECT * FROM guilds WHERE id = ?", [guildId]);

// Use:
const { data } = await client
  .from("guilds")
  .select("*")
  .eq("id", guildId)
  .single();
```

## 🚀 Deploy

No ambiente de produção, configure as variáveis:

```bash
export SUPABASE_URL=https://seu-projeto.supabase.co
export SUPABASE_ANON_KEY=sua-chave-aqui
```

## 🔍 Verificação

Para verificar se o Supabase está configurado:

```bash
curl $SUPABASE_URL/rest/v1/ \
  -H "apikey: $SUPABASE_ANON_KEY"
```

Deve retornar informações sobre as tabelas disponíveis.

