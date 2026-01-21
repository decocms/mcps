# Slack MCP

MCP para integração com Slack, incluindo bot inteligente com gerenciamento de threads, comandos de AI agent e suporte a webhooks.

## Features

- **Bot Inteligente**: Responde a @mentions e mensagens diretas com integração LLM
- **Gerenciamento de Threads**: Cada @mention cria uma nova thread lógica, resolvendo o problema de mistura de contextos
- **Webhooks**: Recebe e processa eventos do Slack via Mesh Universal Webhook Proxy
- **Tools Completas**: Enviar/editar/deletar mensagens, listar canais, buscar usuários, etc.
- **Event Bus**: Integração com Deco Mesh para processamento de eventos

## Configuração Rápida

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

### 2. Instalar no Mesh

1. Acesse o Mesh Dashboard
2. Vá para MCPs → Store
3. Procure por "Slack Bot" e instale
4. Configure os campos obrigatórios:
   - **BOT_TOKEN**: Token do bot (começa com `xoxb-`)
   - **SIGNING_SECRET**: Signing Secret do app

### 3. Configurar Webhook no Slack

Após configurar no Mesh, você verá a **Webhook URL** no painel de configuração. Copie esta URL.

1. No Slack App, vá para **Event Subscriptions**
2. Habilite eventos
3. Cole a Webhook URL no campo **Request URL**
4. O Slack vai verificar a URL automaticamente ✅
5. Adicione os eventos:
   - `app_mention` - Quando o bot é mencionado
   - `message.channels` - Mensagens em canais públicos
   - `message.groups` - Mensagens em canais privados
   - `message.im` - Mensagens diretas
   - `reaction_added` - Reactions adicionadas

## Webhook URL

A URL de webhook é gerada automaticamente pelo Mesh usando o **Universal Webhook Proxy**:

```
https://mesh.deco.cx/webhooks/{connectionId}
```

Esta URL:
- ✅ Responde automaticamente ao challenge de verificação do Slack
- ✅ Verifica assinaturas usando seu `SIGNING_SECRET`
- ✅ Publica eventos no Event Bus para processamento pelo MCP
- ✅ É única para sua conexão/organização

## Campos de Configuração

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| BOT_TOKEN | ✅ | Token do bot (xoxb-...) |
| SIGNING_SECRET | ✅ | Signing Secret para verificar webhooks |
| APP_TOKEN | ❌ | Token para Socket Mode (não usado com webhooks) |
| LOG_CHANNEL_ID | ❌ | Canal para logs do bot |
| THREAD_TIMEOUT_MIN | ❌ | Timeout de inatividade em minutos (padrão: 10) |
| ALLOWED_CHANNELS | ❌ | IDs de canais permitidos (separados por vírgula) |

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

## Arquitetura de Webhooks

Este MCP usa o **Mesh Universal Webhook Proxy** para receber eventos:

```
┌─────────────┐     ┌──────────────────────┐     ┌───────────┐     ┌───────────┐
│  Slack API  │────▶│ Mesh Webhook Proxy   │────▶│ Event Bus │────▶│ Slack MCP │
│             │     │ /webhooks/:connId    │     │           │     │           │
└─────────────┘     └──────────────────────┘     └───────────┘     └───────────┘
        │                     │
        │                     ▼
        │              ┌─────────────────┐
        │              │ Slack Adapter   │
        │              │ - Verifica sig  │
        │              │ - Responde chal │
        │              └─────────────────┘
        │
        ▼
   url_verification
   challenge response
```

**Benefícios:**
- Cada organização tem sua própria URL
- O MCP não precisa expor endpoints HTTP
- Verificação de assinatura centralizada no Mesh
- Challenge do Slack tratado automaticamente

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
