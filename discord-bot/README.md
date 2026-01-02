# Discord Bot MCP

MCP (Model Context Protocol) server para integração com Discord Bot API.

## Funcionalidades

### Mensagens
- Enviar mensagens em canais
- Editar mensagens existentes
- Deletar mensagens
- Fixar/desafixar mensagens
- Adicionar/remover reações
- Buscar mensagens de canais
- Buscar mensagens fixadas

### Canais
- Criar canais (texto, voz, categorias)
- Listar canais do servidor
- Buscar informações de canais específicos

### Servidores (Guilds)
- Listar servidores onde o bot está presente
- Buscar informações de servidores
- Listar membros do servidor
- Banir membros

### Roles
- Criar roles
- Editar roles
- Deletar roles
- Listar roles do servidor

### Threads
- Criar threads
- Entrar/sair de threads
- Listar threads ativas
- Listar threads arquivadas

### Webhooks
- Criar webhooks
- Executar webhooks
- Deletar webhooks
- Listar webhooks

### Usuários
- Buscar informações do usuário atual (bot)
- Buscar informações de usuários específicos

## Configuração

### Pré-requisitos

1. Criar um bot no [Discord Developer Portal](https://discord.com/developers/applications)
2. Obter o Bot Token
3. Adicionar o bot ao seu servidor com as permissões necessárias

### Instalação

1. Instale o MCP no seu workspace Deco
2. Configure o Bot Token quando solicitado

### Permissões Necessárias

O bot precisa das seguintes permissões no Discord:
- Read Messages/View Channels
- Send Messages
- Manage Messages
- Manage Channels
- Manage Roles
- Manage Webhooks
- Ban Members
- Read Message History
- Add Reactions

## Desenvolvimento

```bash
# Instalar dependências
bun install

# Desenvolvimento local
bun run dev

# Build
bun run build

# Deploy
bun run deploy
```

## Estrutura

```
discord-bot/
├── server/
│   ├── main.ts              # Entry point do MCP
│   ├── lib/
│   │   └── types.ts         # Schemas Zod e tipos
│   └── tools/
│       ├── index.ts         # Exporta todas as tools
│       ├── messages.ts      # Tools de mensagens
│       ├── channels.ts      # Tools de canais
│       ├── guilds.ts        # Tools de servidores
│       ├── roles.ts         # Tools de roles
│       ├── threads.ts       # Tools de threads
│       ├── webhooks.ts      # Tools de webhooks
│       └── utils/
│           └── discord-client.ts  # Cliente HTTP Discord
└── shared/
    └── deco.gen.ts          # Tipos gerados automaticamente
```

## Exemplos de Uso

### Enviar uma mensagem

```typescript
{
  "channelId": "123456789",
  "content": "Hello, Discord!"
}
```

### Criar um canal

```typescript
{
  "guildId": "123456789",
  "name": "novo-canal",
  "type": 0
}
```

### Listar servidores

```typescript
{
  "limit": 100
}
```

## API do Discord

Este MCP usa a [Discord API v10](https://discord.com/developers/docs/intro).

## Suporte

Para mais informações sobre a API do Discord, consulte:
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Bot Permissions Calculator](https://discordapi.com/permissions.html)

