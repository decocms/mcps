# Gemini Nano Banana MCP

## Descrição do Projeto

O **Gemini Nano Banana MCP** é um servidor Model Context Protocol (MCP) que integra a API Gemini 2.5 Flash Image Preview para geração de imagens baseadas em texto. Este projeto oferece uma interface web moderna construída com React e Vite, e é hospedado como uma aplicação Cloudflare Workers.

### Propósito

Este servidor MCP permite que aplicações cliente:
- Gerem imagens a partir de prompts de texto usando o modelo Gemini
- Utilizem imagens base para modificações e variações
- Personalizem proporções de imagem (aspect ratios)
- Armazenem e acessem imagens geradas através de um sistema de arquivos
- Gerenciem autorização e pagamentos através do sistema NanoBanana Contract

### Características Principais

- 🎨 **Geração de Imagens com IA**: Integração completa com Gemini 2.5 Flash Image Preview
- 🔄 **Sistema de Retry**: Tentativas automáticas em caso de falha (até 3 tentativas)
- 📝 **Logging Detalhado**: Registro de todas as operações de geração
- 💰 **Gerenciamento de Contratos**: Sistema integrado de autorização e pagamento
- 💾 **Armazenamento Persistente**: Sistema de arquivos para salvar imagens geradas
- 🖼️ **Suporte a Imagens Base**: Modificação de imagens existentes
- 📐 **Aspect Ratios Personalizáveis**: Controle sobre proporções da imagem
- 👤 **Ferramentas de Usuário**: Gerenciamento de informações do usuário

## Setup / Instalação

### Pré-requisitos

- Node.js >= 22.0.0
- Bun (gerenciador de pacotes)
- Conta Cloudflare (para deploy)
- Acesso à API Gemini

### Instalação Local

1. Clone o repositório:
```bash
cd gemini-nano-banana
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

### Build para Produção

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Exemplos de Uso

### Gerando uma Imagem Simples

```typescript
// Cliente MCP
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Um gato laranja sentado em uma cadeira azul, estilo cartoon"
});

// Resultado
{
  image: "https://...", // URL da imagem gerada
  finishReason: "STOP"
}
```

### Gerando com Aspect Ratio Específico

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Paisagem montanhosa ao pôr do sol",
  aspectRatio: "16:9"
});
```

### Modificando uma Imagem Existente

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Adicione neve nas montanhas",
  baseImageUrl: "https://example.com/landscape.jpg"
});
```

### Tratamento de Erros

```typescript
const result = await client.callTool("GENERATE_IMAGE", {
  prompt: "Gere uma imagem..."
});

if (result.error) {
  console.error("Falha na geração:", result.finishReason);
  // Motivos possíveis: SAFETY, MAX_TOKENS, RECITATION, etc.
}
```

## Detalhes de Configuração

### Estrutura de Arquivos

```
gemini-nano-banana/
├── server/              # Código do servidor MCP
│   ├── main.ts         # Entry point principal
│   ├── tools/          # Ferramentas MCP
│   │   ├── index.ts    # Agregador de ferramentas
│   │   ├── gemini.ts   # Ferramenta de geração de imagens
│   │   └── utils/      # Utilitários
│   │       └── gemini.ts # Cliente Gemini
│   └── views.ts        # Configuração de views
├── view/               # Interface React
│   └── src/
│       ├── components/ # Componentes React
│       ├── hooks/      # React hooks personalizados
│       ├── lib/        # Bibliotecas e utilitários
│       └── routes/     # Rotas da aplicação
├── shared/             # Código compartilhado
│   └── deco.gen.ts    # Tipos gerados
└── public/            # Arquivos estáticos
```

### Variáveis de Ambiente / Bindings

O projeto utiliza os seguintes bindings do Cloudflare Workers:

#### `NANOBANANA_CONTRACT`
Sistema de autorização e pagamento para uso da API:
- `CONTRACT_AUTHORIZE`: Autoriza uma transação antes da geração
- `CONTRACT_SETTLE`: Finaliza a transação após a geração

#### `FILE_SYSTEM`
Sistema de armazenamento de imagens:
- `FS_READ`: Lê arquivos do sistema de arquivos
- `FS_WRITE`: Escreve arquivos no sistema de arquivos

### Configuração do OAuth

O projeto suporta OAuth para autenticação. Configure os scopes necessários em `server/main.ts`:

```typescript
oauth: {
  scopes: [], // Adicione scopes conforme necessário
  state: StateSchema,
}
```

### State Schema

O State Schema define o estado da aplicação instalada. Você pode estendê-lo para adicionar campos personalizados, como chaves de API:

```typescript
state: StateSchema.extend({
  geminiApiKey: z.string().optional(),
  // outros campos...
})
```

### Scripts Disponíveis

- `bun run dev` - Inicia servidor de desenvolvimento com hot reload
- `bun run configure` - Configura o projeto Deco
- `bun run gen` - Gera tipos TypeScript
- `bun run build` - Compila para produção
- `bun run deploy` - Faz deploy para Cloudflare Workers
- `bun run check` - Verifica tipos TypeScript sem compilar

### Middlewares de Geração de Imagem

O sistema usa uma arquitetura de middlewares em camadas:

1. **Logging Middleware**: Registra início e fim das operações
2. **Retry Middleware**: Tenta novamente em caso de falha (máx. 3x)
3. **Contract Management**: Gerencia autorização e pagamento

```typescript
const executeWithMiddlewares = withContractManagement(
  withRetry(
    withLogging(executeGeneration, "Gemini"), 
    3
  ),
  "gemini-2.5-flash-image-preview:generateContent"
);
```

### Formato de Input/Output

#### Input (`GenerateImageInput`)
```typescript
{
  prompt: string;              // Descrição da imagem desejada
  baseImageUrl?: string;       // URL de imagem base (opcional)
  aspectRatio?: string;        // Proporção (ex: "16:9", "1:1")
}
```

#### Output (`GenerateImageOutput`)
```typescript
// Sucesso
{
  image: string;               // URL da imagem gerada
  finishReason?: string;       // Motivo de finalização
}

// Erro
{
  error: true;
  finishReason?: string;       // Motivo da falha
}
```

### Endpoints

- `/` - Interface web React
- `/mcp` - Endpoint do servidor MCP
- Todos os outros requests são servidos pelos assets estáticos

## Tecnologias Utilizadas

- **Runtime**: Cloudflare Workers
- **Framework MCP**: Deco Workers Runtime
- **Frontend**: React 19, Vite, TailwindCSS 4
- **Roteamento**: TanStack Router
- **State Management**: TanStack Query
- **UI Components**: Radix UI, Lucide Icons
- **Validação**: Zod
- **Linguagem**: TypeScript

## Licença

