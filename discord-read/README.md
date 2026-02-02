# Discord MCP - Bot com Configuração Persistente

Bot Discord com suporte a IA, comandos de voz, indexação de mensagens e gerenciamento de servidores.

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
  systemPrompt: "Você é um bot útil do Discord..." // opcional
});
```

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
- `DISCORD_CONFIG_CACHE_STATS` - Estatísticas do cache
- `DISCORD_CONFIG_CLEAR_CACHE` - Limpar cache

### Controle do Bot
- `DISCORD_BOT_START` - Iniciar o bot
- `DISCORD_BOT_STOP` - Parar o bot
- `DISCORD_BOT_STATUS` - Status do bot

### Discord API
- `DISCORD_SEND_MESSAGE` - Enviar mensagem
- `DISCORD_GET_CHANNEL_MESSAGES` - Buscar mensagens
- `DISCORD_GET_GUILDS` - Listar servidores
- `DISCORD_GET_CHANNELS` - Listar canais
- `DISCORD_GET_MEMBERS` - Listar membros
- E muitas outras...

### Voz
- `DISCORD_JOIN_VOICE_CHANNEL` - Entrar em canal de voz
- `DISCORD_LEAVE_VOICE_CHANNEL` - Sair de canal de voz
- `DISCORD_SPEAK_TEXT` - Falar texto (TTS)

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
  bot_token TEXT NOT NULL,
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

### 3. Configurar Variáveis de Ambiente

```bash
export SUPABASE_URL=https://seu-projeto.supabase.co
export SUPABASE_ANON_KEY=sua-chave-aqui
```

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

- ✅ **Configuração Persistente** - Token e settings salvos no Supabase
- ✅ **Multi-tenant** - Suporta múltiplas conexões com configurações diferentes
- ✅ **Cache Inteligente** - Cache de 30s para performance
- ✅ **Guilds Autorizados** - Controle quais servidores podem usar o bot
- ✅ **IA Integrada** - Suporte a múltiplos modelos (GPT-4, Claude, etc)
- ✅ **Comandos de Voz** - TTS/STT com Whisper e ElevenLabs
- ✅ **Gerenciamento Completo** - Mensagens, canais, roles, membros, etc

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
// 1. Salvar configuração
await DISCORD_SAVE_CONFIG({
  botToken: "Bot.MTIzNDU2...",
  authorizedGuilds: ["987654321"],
  modelProviderId: "openai",
  modelId: "gpt-4"
});

// 2. Iniciar bot
await DISCORD_BOT_START({});

// 3. Enviar mensagem
await DISCORD_SEND_MESSAGE({
  channelId: "123456789",
  content: "Olá! 👋"
});

// 4. Verificar status
await DISCORD_BOT_STATUS({});

// 5. Parar bot (quando não precisar mais)
await DISCORD_BOT_STOP({});
```

## 📝 License

MIT
