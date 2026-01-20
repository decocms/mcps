# Slack MCP

MCP para integração com Slack, incluindo bot inteligente com gerenciamento de threads, comandos de AI agent e suporte a webhooks.

## Features

- **Bot Inteligente**: Responde a @mentions e mensagens diretas com integração LLM
- **Gerenciamento de Threads**: Cada @mention cria uma nova thread lógica, resolvendo o problema de mistura de contextos
- **Webhooks**: Recebe e processa eventos do Slack (mensagens, reactions, etc.)
- **Tools Completas**: Enviar/editar/deletar mensagens, listar canais, buscar usuários, etc.
- **Event Bus**: Integração com Deco Mesh para processamento de eventos

## Configuração

### 1. Criar um Slack App

1. Acesse [api.slack.com/apps](https://api.slack.com/apps) e crie um novo app
2. Configure as seguintes **OAuth Scopes** (Bot Token Scopes):
   - `app_mentions:read` - Ler mentions ao bot
   - `channels:history` - Ler histórico de canais
   - `channels:read` - Listar canais
   - `chat:write` - Enviar mensagens
   - `groups:history` - Ler histórico de grupos privados
   - `groups:read` - Listar grupos privados
   - `im:history` - Ler histórico de DMs
   - `im:read` - Ler DMs
   - `reactions:read` - Ler reactions
   - `reactions:write` - Adicionar/remover reactions
   - `users:read` - Ler informações de usuários
   - `users:read.email` - Ler emails (opcional)

3. Instale o app no seu workspace

### 2. Configurar Event Subscriptions

1. Na seção **Event Subscriptions**, habilite eventos
2. Configure a Request URL: `https://your-mcp-url/slack/events`
3. Adicione os seguintes eventos:
   - `app_mention` - Quando o bot é mencionado
   - `message.channels` - Mensagens em canais públicos
   - `message.groups` - Mensagens em canais privados
   - `message.im` - Mensagens diretas
   - `reaction_added` - Reactions adicionadas

### 3. Configurar no Mesh

No Dashboard do Mesh, configure:

- **BOT_TOKEN**: Token do bot (começa com `xoxb-`)
- **SIGNING_SECRET**: Signing Secret do app (para verificar webhooks)
- **THREAD_TIMEOUT_MIN**: Timeout de inatividade da thread em minutos (padrão: 10)
- **ALLOWED_CHANNELS**: IDs de canais permitidos (opcional, separados por vírgula)

## Tools Disponíveis

### Mensagens
- `SLACK_SEND_MESSAGE` - Enviar mensagem para canal ou thread
- `SLACK_REPLY_IN_THREAD` - Responder em uma thread
- `SLACK_EDIT_MESSAGE` - Editar mensagem existente
- `SLACK_DELETE_MESSAGE` - Deletar mensagem
- `SLACK_GET_CHANNEL_HISTORY` - Obter histórico de mensagens
- `SLACK_GET_THREAD_REPLIES` - Obter respostas de uma thread
- `SLACK_SEARCH_MESSAGES` - Buscar mensagens

### Canais
- `SLACK_LIST_CHANNELS` - Listar canais do workspace
- `SLACK_GET_CHANNEL_INFO` - Informações de um canal
- `SLACK_JOIN_CHANNEL` - Entrar em um canal
- `SLACK_GET_CHANNEL_MEMBERS` - Listar membros de um canal

### Usuários e Reactions
- `SLACK_GET_USER_INFO` - Informações de um usuário
- `SLACK_LIST_USERS` - Listar usuários do workspace
- `SLACK_GET_BOT_INFO` - Informações do bot
- `SLACK_ADD_REACTION` - Adicionar reaction
- `SLACK_REMOVE_REACTION` - Remover reaction

### Setup e Debug
- `SLACK_GET_BOT_STATUS` - Status do bot
- `SLACK_GET_THREAD_INFO` - Info de thread lógica
- `SLACK_RESET_THREAD` - Resetar contexto de thread
- `SLACK_GET_THREAD_HISTORY` - Histórico de conversa

## Gerenciamento de Threads

O MCP resolve o problema comum de mistura de contextos em bots do Slack:

### Problema Anterior
- Cada canal era tratado como uma thread lógica
- Múltiplas @mentions no mesmo canal misturavam contextos
- Era necessário criar novos canais para "resetar" o bot

### Solução Implementada
- Cada `@mention` ao bot cria uma **nova thread lógica**
- O identificador da thread usa `message.ts` (timestamp da mensagem), não o `channel_id`
- Respostas na mesma thread do Slack mantêm o contexto compartilhado
- Timeout de inatividade (padrão: 10 min) reseta automaticamente o contexto

### Como Funciona

```
@bot pergunta 1    → Nova thread lógica (ID: channel:ts1)
  ↳ resposta       → Continua na mesma thread lógica
  ↳ mais pergunta  → Continua na mesma thread lógica

@bot pergunta 2    → NOVA thread lógica (ID: channel:ts2)
                     (contexto limpo, sem mistura com pergunta 1)
```

## Desenvolvimento

```bash
cd slack-mcp
bun install
bun run dev
```

## Deploy

O deploy é automático via GitHub Actions quando há push para `main`.

```bash
bun run scripts/deploy.ts slack-mcp
```

## Endpoints

- `POST /slack/events` - Eventos do Slack (Event Subscriptions)
- `POST /slack/commands` - Slash Commands
- `POST /slack/interactive` - Componentes interativos
- `GET /health` - Health check

