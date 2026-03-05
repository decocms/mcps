# Análise de Bindings - Discord MCP

## 📦 Bindings Disponíveis no Mesh

### 1. **EVENT_BUS** (`@deco/event-bus`)
**Propósito**: Pub/Sub de eventos entre MCPs  
**Tools**:
- `EVENT_PUBLISH` - Publicar eventos
- `EVENT_SUBSCRIBE` - Criar subscrições
- `EVENT_UNSUBSCRIBE` - Remover subscrições
- `EVENT_SUBSCRIPTION_LIST` - Listar subscrições
- `EVENT_CANCEL` - Cancelar eventos recorrentes
- `EVENT_ACK` - Confirmar entrega

**Status no Discord**: ⚠️ **Declarado mas não usado**
- ✅ Declarado no `StateSchema`
- ✅ Handler básico implementado (só loga)
- ❌ Não publica eventos
- ❌ Não usa as tools de EVENT_BUS

---

### 2. **EVENT_SUBSCRIBER** (`@deco/event-subscriber`)
**Propósito**: Receber eventos publicados por outros MCPs  
**Tools**:
- `ON_EVENTS` - Handler para processar eventos recebidos

**Status no Discord**: ❌ **Não implementado**

---

### 3. **OBJECT_STORAGE** (`@deco/object-storage`)
**Propósito**: Armazenamento S3-compatible de arquivos  
**Tools**:
- `LIST_OBJECTS` - Listar objetos
- `GET_OBJECT_METADATA` - Metadados do objeto
- `GET_PRESIGNED_URL` - URL pré-assinada para download
- `PUT_PRESIGNED_URL` - URL pré-assinada para upload
- `DELETE_OBJECT` - Deletar objeto
- `DELETE_OBJECTS` - Deletar múltiplos objetos

**Status no Discord**: ❌ **Não implementado**

---

### 4. **COLLECTIONS** (`@deco/collections`)
**Propósito**: CRUD padronizado para entidades (TanStack DB compatible)  
**Tools** (por collection):
- `COLLECTION_{NAME}_LIST` - Listar com filtros
- `COLLECTION_{NAME}_GET` - Obter por ID
- `COLLECTION_{NAME}_CREATE` - Criar
- `COLLECTION_{NAME}_UPDATE` - Atualizar
- `COLLECTION_{NAME}_DELETE` - Deletar
- `COLLECTION_{NAME}_SEARCH` - Busca full-text

**Status no Discord**: ❌ **Não implementado**

---

### 5. **WORKFLOW** (`@deco/workflow`)
**Propósito**: Orquestração de workflows multi-step  
**Tools**:
- `WORKFLOW_RUN` - Executar workflow
- `WORKFLOW_GET` - Obter status
- `WORKFLOW_CANCEL` - Cancelar execução

**Status no Discord**: ❌ **Não implementado**

---

### 6. **PROMPT** (`@deco/prompt`)
**Propósito**: Gerenciamento de prompts reutilizáveis  
**Tools**:
- `PROMPT_GET` - Obter prompt
- `PROMPT_LIST` - Listar prompts disponíveis

**Status no Discord**: ❌ **Não implementado**

---

### 7. **ASSISTANT** (`@deco/assistant`)
**Propósito**: Agentes de IA reutilizáveis  
**Tools**:
- `ASSISTANT_RUN` - Executar assistente

**Status no Discord**: ❌ **Não implementado**

---

### 8. **LANGUAGE_MODEL** (`@deco/language-model`)
**Propósito**: Acesso a modelos LLM  
**Status no Discord**: ✅ **Usado**
- Declarado no `StateSchema`
- Usado via integração com Decopilot

---

### 9. **MODEL_PROVIDER** / **AGENT**
**Propósito**: Provider de modelos e configuração de agente  
**Status no Discord**: ✅ **Usado**
- Declarado no `StateSchema`
- Usado para configurar modelo e agente

---

### 10. **CONNECTION** (`@deco/connection`)
**Propósito**: Metadados da conexão MCP  
**Status no Discord**: ✅ **Declarado**

---

## 🎯 Recomendações de Implementação

### Alta Prioridade 🔴

#### 1. **EVENT_BUS** - Publicar Eventos do Discord
**Por quê**: Permitir que outros MCPs reajam a eventos do Discord

**Eventos para publicar**:
```typescript
// Mensagens
"discord.message.created"
"discord.message.deleted"
"discord.message.updated"

// Membros
"discord.member.joined"
"discord.member.left"
"discord.member.banned"
"discord.member.role_added"
"discord.member.role_removed"

// Canais
"discord.channel.created"
"discord.channel.deleted"

// Reações
"discord.reaction.added"
"discord.reaction.removed"
```

**Exemplo de implementação**:
```typescript
// No messageHandler.ts
await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
  type: "discord.message.created",
  subject: message.id,
  data: {
    guild_id: message.guild?.id,
    channel_id: message.channel.id,
    author_id: message.author.id,
    content: message.content,
    timestamp: message.createdAt.toISOString(),
  },
});
```

**Benefícios**:
- ✅ Outros MCPs podem reagir a mensagens do Discord
- ✅ Automações cross-MCP (ex: Notion cria nota quando mencionado)
- ✅ Audit trail completo

---

#### 2. **EVENT_SUBSCRIBER** - Reagir a Eventos Externos
**Por quê**: Permitir que o Discord responda a eventos de outros MCPs

**Exemplos de uso**:
```typescript
// Notificar no Discord quando:
"notion.page.created" → Enviar mensagem no canal #updates
"github.pr.merged" → Comemorar no canal #dev
"calendar.event.starting" → Mencionar participantes no canal
"slack.message.important" → Mirror para Discord
```

**Implementação**:
- Criar handler `ON_EVENTS` no `main.ts`
- Processar eventos recebidos
- Enviar mensagens apropriadas no Discord

---

### Média Prioridade 🟡

#### 3. **OBJECT_STORAGE** - Gerenciar Anexos
**Por quê**: Armazenar e gerenciar arquivos enviados no Discord

**Use cases**:
- Fazer upload de arquivos grandes
- Gerar links pré-assinados para downloads
- Arquivar attachments importantes
- Backup de imagens/arquivos

**Exemplo**:
```typescript
// Tool: DISCORD_UPLOAD_FILE
// 1. Recebe file do Discord
// 2. Faz upload para OBJECT_STORAGE
// 3. Retorna presigned URL
// 4. Compartilha no canal
```

---

#### 4. **COLLECTIONS** - CRUD de Entidades Discord
**Por quê**: Interface padronizada para gerenciar dados do Discord

**Collections sugeridas**:
```typescript
COLLECTION_GUILDS      // Gerenciar servers
COLLECTION_CHANNELS    // Gerenciar canais
COLLECTION_MEMBERS     // Gerenciar membros
COLLECTION_ROLES       // Gerenciar cargos
COLLECTION_MESSAGES    // Histórico de mensagens
```

**Benefícios**:
- ✅ Interface consistente com TanStack DB
- ✅ Filtros e busca padronizados
- ✅ Paginação automática
- ✅ Validação de schema

---

### Baixa Prioridade 🟢

#### 5. **WORKFLOW** - Automações Complexas
**Por quê**: Orquestrar workflows multi-step no Discord

**Exemplos**:
```typescript
// Workflow: "onboard-new-member"
1. Detectar novo membro
2. Enviar DM de boas-vindas
3. Adicionar cargo "Novo"
4. Notificar moderadores
5. Agendar follow-up em 24h

// Workflow: "escalate-report"
1. Receber report de abuso
2. Avaliar gravidade (AI)
3. Notificar moderador
4. Se grave: timeout automático
5. Criar ticket no Notion
```

---

#### 6. **PROMPT** - Gerenciar Prompts do Bot
**Por quê**: Centralizar e versionar system prompts

**Use cases**:
- Diferentes prompts por canal
- Versioning de prompts
- A/B testing de comportamentos
- Prompts compartilhados entre MCPs

---

#### 7. **ASSISTANT** - Sub-agentes Especializados
**Por quê**: Delegar tarefas para agentes especializados

**Exemplos**:
```typescript
// ASSISTANT: "moderator"
// - Especializado em moderação
// - Detecta toxicidade
// - Sugere ações

// ASSISTANT: "translator"
// - Traduz mensagens
// - Suporta múltiplos idiomas

// ASSISTANT: "summarizer"
// - Resume conversas longas
// - Gera daily digests
```

---

## 📊 Resumo de Status

| Binding | Declarado | Implementado | Prioridade |
|---------|-----------|--------------|------------|
| EVENT_BUS | ✅ | ⚠️ (parcial) | 🔴 Alta |
| EVENT_SUBSCRIBER | ❌ | ❌ | 🔴 Alta |
| OBJECT_STORAGE | ❌ | ❌ | 🟡 Média |
| COLLECTIONS | ❌ | ❌ | 🟡 Média |
| WORKFLOW | ❌ | ❌ | 🟢 Baixa |
| PROMPT | ❌ | ❌ | 🟢 Baixa |
| ASSISTANT | ❌ | ❌ | 🟢 Baixa |
| LANGUAGE_MODEL | ✅ | ✅ | ✅ Usado |
| MODEL_PROVIDER | ✅ | ✅ | ✅ Usado |
| AGENT | ✅ | ✅ | ✅ Usado |
| CONNECTION | ✅ | ✅ | ✅ Usado |

---

## 🚀 Próximos Passos

### Fase 1: Event Bus (1-2 dias)
1. Implementar `EVENT_PUBLISH` para eventos principais do Discord
2. Adicionar tools para gerenciar subscrições
3. Documentar eventos disponíveis

### Fase 2: Event Subscriber (1 dia)
1. Implementar handler `ON_EVENTS`
2. Criar lógica para processar eventos externos
3. Suportar filtros e regras de roteamento

### Fase 3: Object Storage (2-3 dias)
1. Integrar com binding de Object Storage
2. Criar tools para upload/download
3. Implementar cache de attachments

### Fase 4: Collections (3-4 dias)
1. Definir schemas para entidades principais
2. Implementar CRUD via Collections binding
3. Migrar queries atuais para usar Collections

---

## 💡 Benefícios da Implementação

### Interoperabilidade
- ✅ Discord pode reagir a eventos de qualquer MCP
- ✅ Outros MCPs podem reagir a eventos do Discord
- ✅ Workflows cross-platform

### Consistência
- ✅ Interface padronizada (COLLECTIONS)
- ✅ Event schema consistente (CloudEvents)
- ✅ Melhor DX para desenvolvedores

### Escalabilidade
- ✅ Event-driven architecture
- ✅ Desacoplamento de MCPs
- ✅ Fácil adicionar novas integrações

### Observabilidade
- ✅ Audit trail completo via events
- ✅ Debugging facilitado
- ✅ Analytics e métricas

