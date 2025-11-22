# Perplexity AI MCP

## Descrição do Projeto

**Perplexity AI MCP** é um servidor Model Context Protocol (MCP) que integra a API do Perplexity AI para fornecer respostas fundamentadas na web. Este projeto é hospedado como uma aplicação Cloudflare Workers.

### Propósito

Este servidor MCP permite que aplicações cliente:
- Façam perguntas em linguagem natural e recebam respostas fundamentadas na web
- Realizem conversas multi-turno com contexto de histórico de mensagens
- Personalizem parâmetros de busca (domínios, recência, contexto)
- Utilizem diferentes modelos Perplexity (sonar, sonar-pro, etc.)
- Controlem a geração de respostas (temperatura, tokens, etc.)

### Recursos Principais

- 🤖 **Integração com Perplexity AI**: Acesso completo à API do Perplexity
- 💬 **Dois Modos de Interação**: Prompt simples ou conversação multi-turno
- 🔍 **Busca Personalizada**: Filtros de domínio, recência e contexto
- 🎯 **Múltiplos Modelos**: Suporte para sonar, sonar-pro, sonar-deep-research, sonar-reasoning-pro e sonar-reasoning
- ⚙️ **Controle Fino**: Ajuste de temperatura, top_p, max_tokens e muito mais
- 💰 **Sistema de Contratos**: Gerenciamento de autorização e pagamento por consulta
- 🔄 **Retry Automático**: Sistema de retry com até 3 tentativas
- ⏱️ **Timeout Configurável**: Proteção contra requisições longas
- 👤 **Ferramentas de Usuário**: Gerenciamento de informações do usuário
- 📊 **Informações de Uso**: Retorna contagem de tokens utilizados

## Configuração / Instalação

### Pré-requisitos

- Node.js >= 22.0.0
- Bun (gerenciador de pacotes)
- Conta Cloudflare (para deploy)
- Chave de API do Perplexity (obtenha em https://www.perplexity.ai/settings/api)

### Instalação Local

1. Clone o repositório e entre no diretório do Perplexity:
```bash
git clone https://github.com/deco-cx/mcps.git
cd mcps/perplexity
```

2. Instale as dependências:
```bash
bun install
```

3. Configure as variáveis de ambiente necessárias:
```bash
bun run configure
```

4. Gere os tipos TypeScript:
```bash
bun run gen
```

5. Inicie o servidor de desenvolvimento:
```bash
bun run dev
```

O servidor estará disponível em `http://localhost:8787` (porta padrão do Cloudflare Workers).

### Build de Produção

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Exemplos de Uso

### Fazer uma Pergunta Simples

```typescript
// Cliente MCP
const result = await client.callTool("ask_perplexity", {
  prompt: "Qual é a capital da França e sua população atual?"
});

// Resultado
{
  answer: "A capital da França é Paris, com uma população metropolitana...",
  usage: {
    prompt_tokens: 15,
    completion_tokens: 120,
    total_tokens: 135
  }
}
```

### Conversa Multi-Turno

```typescript
const result = await client.callTool("chat_with_perplexity", {
  messages: [
    { role: "user", content: "O que é inteligência artificial?" },
    { role: "assistant", content: "IA é a simulação de processos..." },
    { role: "user", content: "Quais são as principais aplicações?" }
  ]
});
```

### Busca com Filtros Personalizados

```typescript
const result = await client.callTool("ask_perplexity", {
  prompt: "Últimas notícias sobre tecnologia",
  search_recency_filter: "day",
  search_domain_filter: ["techcrunch.com", "theverge.com"],
  search_context_size: "maximum",
  model: "sonar-pro"
});
```

### Usar Modelo de Raciocínio

```typescript
const result = await client.callTool("ask_perplexity", {
  prompt: "Explique o teorema de Pitágoras e como prová-lo",
  model: "sonar-reasoning-pro",
  temperature: 0.1
});
```

### Tratamento de Erros

```typescript
try {
  const result = await client.callTool("ask_perplexity", {
    prompt: "Minha pergunta..."
  });
  console.log(result.answer);
} catch (error) {
  console.error("Erro ao consultar Perplexity:", error.message);
}
```

## Detalhes de Configuração

### Estrutura de Arquivos

```
perplexity/
├── server/              # Código do servidor MCP
│   ├── main.ts         # Ponto de entrada principal
│   ├── constants.ts    # Constantes (URLs base, etc)
│   ├── lib/            # Bibliotecas
│   │   ├── types.ts    # Definições de tipos TypeScript
│   │   └── perplexity-client.ts # Cliente da API Perplexity
│   └── tools/          # Ferramentas MCP
│       ├── index.ts    # Agregador de ferramentas
│       └── perplexity.ts # Ferramentas do Perplexity
└── shared/             # Código compartilhado
    └── deco.gen.ts    # Tipos gerados
```

### Variáveis de Ambiente / Bindings

O projeto utiliza os seguintes bindings do Cloudflare Workers:

#### `PERPLEXITY_API_KEY`
Chave de API do Perplexity AI:
- Obtenha sua chave em: https://www.perplexity.ai/settings/api
- Configure durante a instalação da integração

#### `DEFAULT_MODEL`
Modelo padrão a ser usado (opcional):
- Opções: `sonar`, `sonar-pro`, `sonar-deep-research`, `sonar-reasoning-pro`, `sonar-reasoning`
- Padrão: `sonar`

#### `PERPLEXITY_CONTRACT`
Sistema de autorização e pagamento por uso:
- `CONTRACT_AUTHORIZE`: Autoriza uma transação antes da consulta
- `CONTRACT_SETTLE`: Finaliza a transação após a consulta
- **Clauses configuradas:**
  - `perplexity:ask`: $0.01 por pergunta simples
  - `perplexity:chat`: $0.02 por mensagem de chat

#### `FILE_SYSTEM`
Sistema de armazenamento de arquivos:
- `FS_READ`: Lê arquivos do sistema de arquivos
- `FS_WRITE`: Escreve arquivos no sistema de arquivos

### Configuração OAuth

O projeto suporta OAuth para autenticação. Configure os escopos necessários em `server/main.ts`:

```typescript
oauth: {
  scopes: [
    Scopes.PERPLEXITY_CONTRACT.CONTRACT_AUTHORIZE,
    Scopes.PERPLEXITY_CONTRACT.CONTRACT_SETTLE,
    Scopes.FILE_SYSTEM.FS_READ,
    Scopes.FILE_SYSTEM.FS_WRITE,
  ],
  state: StateSchema,
}
```

### State Schema

O State Schema define o estado da aplicação instalada. Você pode estendê-lo para adicionar campos personalizados:

```typescript
const StateSchema = BaseStateSchema.extend({
  PERPLEXITY_API_KEY: z.string(),
  DEFAULT_MODEL: z.enum([...]).optional(),
  // outros campos...
})
```

### Scripts Disponíveis

- `bun run dev` - Inicia servidor de desenvolvimento com hot reload
- `bun run configure` - Configura o projeto Deco
- `bun run gen` - Gera tipos TypeScript
- `bun run build` - Compila para produção
- `bun run deploy` - Faz deploy no Cloudflare Workers
- `bun run check` - Verifica tipos TypeScript sem compilar

### Ferramentas MCP Disponíveis

#### `ask_perplexity`
Faz uma pergunta simples ao Perplexity AI.

**Parâmetros:**
- `prompt` (string, obrigatório): A pergunta ou prompt
- `model` (string, opcional): Modelo a usar (padrão: "sonar")
- `max_tokens` (number, opcional): Máximo de tokens na resposta
- `temperature` (number, opcional): Controla aleatoriedade (0-2, padrão: 0.2)
- `top_p` (number, opcional): Controla diversidade (0-1, padrão: 0.9)
- `search_domain_filter` (string[], opcional): Limita busca a domínios específicos (máx 3)
- `return_images` (boolean, opcional): Incluir imagens nos resultados
- `return_related_questions` (boolean, opcional): Retornar perguntas relacionadas
- `search_recency_filter` (string, opcional): Filtrar por tempo ("week", "day", "month")
- `search_context_size` (string, opcional): Quantidade de contexto ("low", "medium", "high", "maximum")

#### `chat_with_perplexity`
Mantém uma conversa multi-turno com o Perplexity AI.

**Parâmetros:**
- `messages` (Message[], obrigatório): Array de mensagens da conversa
  - Cada mensagem: `{ role: "system" | "user" | "assistant", content: string }`
- Todos os outros parâmetros do `ask_perplexity` também estão disponíveis

### Modelos Disponíveis

- **sonar**: Modelo padrão, rápido e eficiente
- **sonar-pro**: Versão premium com respostas mais detalhadas
- **sonar-deep-research**: Para pesquisas aprofundadas e análises complexas
- **sonar-reasoning-pro**: Para raciocínio avançado e lógica
- **sonar-reasoning**: Para tarefas que requerem raciocínio

### Formato de Entrada/Saída

#### Entrada (`ask_perplexity`)
```typescript
{
  prompt: string;
  model?: "sonar" | "sonar-pro" | ...;
  temperature?: number;
  max_tokens?: number;
  // ... outros parâmetros
}
```

#### Saída
```typescript
{
  content: [{
    type: "text",
    text: string // JSON stringificado com answer, usage, etc
  }]
}
```

Formato do JSON:
```typescript
{
  answer: string;              // Resposta gerada
  model?: string;              // Modelo usado
  finish_reason?: string;      // Razão de término
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
}
```

### Endpoints

- `/mcp` - Endpoint do servidor MCP
- Todas as outras requisições fazem fallback para assets estáticos

## Tecnologias Utilizadas

- **Runtime**: Cloudflare Workers
- **Framework MCP**: Deco Workers Runtime
- **Build Tool**: Vite
- **Validação**: Zod
- **Linguagem**: TypeScript

## Licença

MIT
