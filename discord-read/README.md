# Discord MCP - Bot com Configuração Persistente

> **Status**: Production-ready | **Last Deploy**: 2026-02-03

Bot Discord avançado com suporte a IA, webhooks, slash commands, event bus, indexação de mensagens e gerenciamento completo de servidores.

## 🚀 Como Usar

### 1. Configurar o Bot (Uma Vez)

Use a tool `DISCORD_SAVE_CONFIG` para salvar a configuração do bot no Supabase:

```typescript
await DISCORD_SAVE_CONFIG({
  botToken: "Bot.SEU_TOKEN_AQUI",
  authorizedGuilds: ["123456789"], // opcional - lista de guilds autorizados
  ownerId: "111222333444555", // opcional - seu Discord user ID
  commandPrefix: "!",
  modelProviderId: "openai-connection-id", // opcional
  modelId: "gpt-4", // opcional
  systemPrompt: "Você é um bot útil do Discord...", // opcional
  meshApiKey: "mesh_key_...", // opcional - API key persistente (recomendado)
  discordPublicKey: "your_discord_public_key" // opcional - para webhooks
});
```

**💡 Dica:** Use `DISCORD_GENERATE_API_KEY` para criar uma API key persistente que nunca expira!

### 2. Iniciar o Bot

Depois de salvar a configuração, use a tool `DISCORD_BOT_START`:

```typescript
await DISCORD_BOT_START({});
// Retorna: { success: true, message: "Bot started!", botTag: "MyBot#1234", guilds: 5 }
```

O bot agora vai:
- ✅ Carregar a configuração do Supabase automaticamente
- ✅ Conectar no Discord Gateway usando o token salvo
- ✅ Responder apenas nos guilds autorizados (se configurado)
- ✅ Usar o modelo de IA configurado

### 3. Gerenciar o Bot

```typescript
// Verificar status
await DISCORD_BOT_STATUS({});
// Retorna: { running: true, botTag: "MyBot#1234", guilds: 5, uptime: 3600000 }

// Parar o bot
await DISCORD_BOT_STOP({});
// Retorna: { success: true, message: "Bot stopped" }
```

## 📋 Tools Disponíveis

### Configuração
- `DISCORD_SAVE_CONFIG` - Salvar configuração no Supabase
- `DISCORD_LOAD_CONFIG` - Carregar configuração salva
- `DISCORD_DELETE_CONFIG` - Remover configuração
- `DISCORD_GENERATE_API_KEY` - Gerar API key persistente (nunca expira)
- `DISCORD_CONFIG_CACHE_STATS` - Estatísticas do cache
- `DISCORD_CONFIG_CLEAR_CACHE` - Limpar cache

### Controle do Bot
- `DISCORD_BOT_START` - Iniciar o bot
- `DISCORD_BOT_STOP` - Parar o bot
- `DISCORD_BOT_STATUS` - Status do bot

### Discord API - Mensagens
- `DISCORD_SEND_MESSAGE` - Enviar mensagem
- `DISCORD_GET_CHANNEL_MESSAGES` - Buscar mensagens
- `DISCORD_EDIT_MESSAGE` - Editar mensagem
- `DISCORD_DELETE_MESSAGE` - Deletar mensagem
- `DISCORD_PIN_MESSAGE` - Fixar mensagem
- `DISCORD_SEARCH_USER_MENTIONS` - Buscar menções de usuário

### Discord API - Servidores e Canais
- `DISCORD_GET_GUILDS` - Listar servidores
- `DISCORD_GET_CHANNELS` - Listar canais
- `DISCORD_CREATE_CHANNEL` - Criar canal
- `DISCORD_EDIT_CHANNEL` - Editar canal
- `DISCORD_DELETE_CHANNEL` - Deletar canal

### Discord API - Membros e Roles
- `DISCORD_GET_MEMBERS` - Listar membros
- `DISCORD_EDIT_MEMBER` - Editar membro
- `DISCORD_BAN_MEMBER` - Banir membro
- `DISCORD_KICK_MEMBER` - Expulsar membro
- `DISCORD_GET_ROLES` - Listar roles
- `DISCORD_CREATE_ROLE` - Criar role
- `DISCORD_ASSIGN_ROLE` - Atribuir role

### Database - Análise e Contexto
- `DISCORD_QUERY_MESSAGES` - Consultar mensagens indexadas
- `DISCORD_QUERY_GUILDS` - Consultar servidores
- `DISCORD_MESSAGE_STATS` - Estatísticas de mensagens
- `DISCORD_QUERY_CHANNEL_CONTEXTS` - Listar contextos de canal
- `DISCORD_SET_CHANNEL_AUTO_RESPOND` - Configurar resposta automática

### Slash Commands (Webhooks)
- `DISCORD_REGISTER_SLASH_COMMAND` - Registrar comando /slash no Discord
- `DISCORD_DELETE_SLASH_COMMAND` - Remover comando do Discord e banco
- `DISCORD_LIST_SLASH_COMMANDS` - Listar comandos (database/discord/both)
- `DISCORD_TOGGLE_SLASH_COMMAND` - Ativar/desativar comando
- `DISCORD_SYNC_SLASH_COMMANDS` - Sincronizar comandos entre Discord e banco

## 🔧 Configuração do Supabase

### 1. Criar Projeto no Supabase
- Acesse https://supabase.com
- Crie um novo projeto

### 2. Criar Tabela
Execute o SQL no Supabase SQL Editor:

```sql
CREATE TABLE discord_connections (
  connection_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mesh_url TEXT NOT NULL,
  mesh_token TEXT,
  mesh_api_key TEXT, -- API key persistente (recomendado)
  bot_token TEXT NOT NULL,
  discord_public_key TEXT, -- Para webhooks
  authorized_guilds TEXT[],
  owner_id TEXT,
  command_prefix TEXT DEFAULT '!' NOT NULL,
  model_provider_id TEXT,
  model_id TEXT,
  agent_id TEXT,
  system_prompt TEXT,
  configured_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_discord_connections_org ON discord_connections(organization_id);
```

**📄 Schema Completo:** Execute `SUPABASE_SECURITY_FINAL.sql` para criar todas as tabelas com RLS.

### 3. Configurar Variáveis de Ambiente

```bash
export SUPABASE_URL=https://seu-projeto.supabase.co
export SUPABASE_ANON_KEY=sua-chave-aqui
```

## 🔌 Webhooks e Slash Commands

O bot suporta Discord Interactions via webhooks para criar comandos /slash nativos.

### Configurar Webhook URL

No Discord Developer Portal:
1. Vá em "General Information"
2. Configure "Interactions Endpoint URL": `https://seu-mcp.deco.site/discord/interactions/seu-connection-id`
3. Copie a "Public Key" e salve na configuração

### Gerenciar Slash Commands

```typescript
// 1. Registrar comando /start (global)
await DISCORD_REGISTER_SLASH_COMMAND({
  commandName: "start",
  description: "Iniciar o bot se ele estiver offline",
  enabled: true
});

// 2. Registrar comando guild-specific com opções
await DISCORD_REGISTER_SLASH_COMMAND({
  commandName: "echo",
  description: "Repetir uma mensagem",
  guildId: "123456789",
  options: [
    {
      type: "STRING",
      name: "message",
      description: "Mensagem para repetir",
      required: true
    }
  ]
});

// 3. Listar comandos do banco de dados
await DISCORD_LIST_SLASH_COMMANDS({
  source: "database"
});

// 4. Listar comandos diretamente do Discord (via API)
await DISCORD_LIST_SLASH_COMMANDS({
  source: "discord",
  guildId: "123456789" // opcional
});

// 5. Comparar banco vs Discord (detectar diferenças)
await DISCORD_LIST_SLASH_COMMANDS({
  source: "both"
});
// Retorna: commands com inDatabase/inDiscord flags

// 6. Sincronizar: importar comandos do Discord para o banco
await DISCORD_SYNC_SLASH_COMMANDS({
  action: "import",
  guildId: "123456789",
  dryRun: true // preview antes de aplicar
});

// 7. Sincronizar: limpar comandos órfãos do banco
await DISCORD_SYNC_SLASH_COMMANDS({
  action: "clean",
  dryRun: false // aplicar mudanças
});

// 8. Sincronização completa (import + clean)
await DISCORD_SYNC_SLASH_COMMANDS({
  action: "full-sync"
});

// 9. Desativar comando (sem deletar)
await DISCORD_TOGGLE_SLASH_COMMAND({
  commandId: "cmd-uuid-from-db",
  enabled: false
});

// 10. Deletar comando do Discord e banco
await DISCORD_DELETE_SLASH_COMMAND({
  commandId: "cmd-uuid-from-db"
});
```

### Event Bus Integration

O bot publica eventos para o Mesh Event Bus automaticamente:

**Eventos Publicados:**
- `discord.message.created` - Nova mensagem
- `discord.message.deleted` - Mensagem deletada
- `discord.message.updated` - Mensagem editada
- `discord.member.joined` - Membro entrou
- `discord.member.left` - Membro saiu
- `discord.member.role.added` - Role atribuída
- `discord.member.role.removed` - Role removida
- `discord.reaction.added` - Reação adicionada
- `discord.reaction.removed` - Reação removida

Outros MCPs podem se inscrever nesses eventos para reagir automaticamente.

## 🏃 Desenvolvimento Local

```bash
# Instalar dependências
bun install

# Rodar em desenvolvimento (hot reload)
bun run dev

# Build para produção
bun run build

# Iniciar em produção
bun run start

# Build + Start
bun run build:start
```

## 🎯 Recursos

### Core
- ✅ **Configuração Persistente** - Token e settings salvos no Supabase
- ✅ **API Key Persistente** - Nunca expira, elimina problemas de sessão
- ✅ **Multi-tenant** - Suporta múltiplas conexões com configurações diferentes
- ✅ **Cache Inteligente** - Cache de 30s para performance
- ✅ **Guilds Autorizados** - Controle quais servidores podem usar o bot

### IA e Automação
- ✅ **IA Integrada** - Suporte a múltiplos modelos (GPT-4, Claude, etc)
- ✅ **Auto-respond** - Canais podem responder automaticamente sem mencionar o bot
- ✅ **Contexto por Canal** - System prompts personalizados por canal
- ✅ **Indexação Automática** - Todas as mensagens indexadas no Supabase

### Webhooks e Interatividade
- ✅ **Slash Commands** - Comandos /nativos do Discord via webhooks
- ✅ **Webhook Verification** - Suporte completo ao Discord Interactions
- ✅ **Event Bus** - Publica eventos de Discord para outros MCPs

### Gerenciamento
- ✅ **Gerenciamento Completo** - Mensagens, canais, roles, membros, etc
- ✅ **Busca Avançada** - Buscar menções de usuários com contexto de threads
- ✅ **Análise de Dados** - Estatísticas de mensagens, atividade, etc

## 🔐 Segurança

### Proteção por Disciplina

A segurança da tabela `discord_connections` é garantida por **não criar tools MCP que a acessam**:

- ✅ **Código interno** pode acessar `discord_connections`
- ❌ **Tools MCP** NUNCA devem acessar `discord_connections`
- 🔒 **Regra**: Ao criar novas tools, verificar que não acessam essa tabela

### Tabela de Permissões

| Tabela                     | Código Interno | Tools MCP | Regra |
|----------------------------|----------------|-----------|-------|
| `discord_connections`      | ✅ Acesso      | 🔒 **PROIBIDO** | NUNCA criar tools! |
| `discord_message`          | ✅ Acesso      | ✅ Read/Write | OK |
| `guilds`                   | ✅ Acesso      | ✅ Read/Write | OK |
| `discord_channel`          | ✅ Acesso      | ✅ Read/Write | OK |
| `discord_member`           | ✅ Acesso      | ✅ Read/Write | OK |
| `discord_message_reaction` | ✅ Acesso      | ✅ Read/Write | OK |
| `discord_audit_log`        | ✅ Acesso      | ✅ Write only | OK |
| `discord_voice_state`      | ✅ Acesso      | ✅ Read/Write | OK |

### Scripts de Segurança

Execute o script SQL para criar as tabelas com RLS:

```bash
# Execute SUPABASE_SECURITY_FINAL.sql no Supabase SQL Editor
# Isso vai:
# 1. Criar todas as tabelas
# 2. Habilitar RLS em todas as tabelas
# 3. Configurar policies de acesso
```

### Boas Práticas

- ✅ Token do Discord armazenado de forma segura no Supabase
- ✅ Suporte a guilds autorizados para controlar acesso
- ✅ Owner ID para comandos administrativos
- ✅ Cache com TTL de 30 segundos
- ⚠️ **NUNCA criar tools que acessam discord_connections**

## 📖 Documentação Completa

Para mais detalhes, veja:
- `SUPABASE_SETUP.md` - Guia completo de setup do Supabase
- `server/prompts/system.ts` - System prompt e guia de uso

## 🤝 Exemplo de Fluxo Completo

```typescript
// 1. Gerar API key persistente (recomendado)
await DISCORD_GENERATE_API_KEY({});
// Retorna: { success: true, hasApiKey: true, message: "API Key criada!" }

// 2. Salvar configuração (API key já salva automaticamente)
await DISCORD_SAVE_CONFIG({
  botToken: "Bot.MTIzNDU2...",
  authorizedGuilds: ["987654321"],
  modelProviderId: "openai",
  modelId: "gpt-4",
  discordPublicKey: "abc123..." // Para webhooks
});

// 3. Iniciar bot
await DISCORD_BOT_START({});
// Retorna: { success: true, botTag: "MyBot#1234", guilds: 5 }

// 4. Configurar auto-respond em um canal
await DISCORD_SET_CHANNEL_AUTO_RESPOND({
  guildId: "987654321",
  channelId: "123456789",
  autoRespond: true
});

// 5. Registrar slash command
await DISCORD_REGISTER_SLASH_COMMAND({
  commandName: "help",
  commandDescription: "Mostrar ajuda",
  toolId: "DISCORD_SEND_MESSAGE"
});

// 6. Enviar mensagem
await DISCORD_SEND_MESSAGE({
  channelId: "123456789",
  content: "Bot online! 🤖"
});

// 7. Buscar menções de um usuário
await DISCORD_SEARCH_USER_MENTIONS({
  guild_id: "987654321",
  user_id: "111222333",
  days: 7
});

// 8. Verificar status
await DISCORD_BOT_STATUS({});

// 9. Parar bot (quando não precisar mais)
await DISCORD_BOT_STOP({});
```

## 🔒 API Key vs Session Token

### Session Token (Padrão)
- ❌ Expira após algumas horas
- ❌ Requer cliques em "Save" no Mesh periodicamente
- ❌ Causa erro "Organization context is required"

### API Key Persistente (Recomendado)
- ✅ Nunca expira
- ✅ Configurar uma vez e esquecer
- ✅ Sem erros de autenticação
- ✅ Gerado com `DISCORD_GENERATE_API_KEY`

**Migração:** Se você já usa session token, basta executar `DISCORD_GENERATE_API_KEY` e a API key será salva automaticamente.

## 📝 License

MIT

