# Como Criar um Novo MCP

## ⚠️ Importante

**Reutilize código compartilhado:** O diretório `/shared` centraliza utilitários, tools e lógicas comuns entre MCPs. Sempre verifique se já existe uma implementação antes de criar código duplicado. Isso mantém consistência e facilita manutenção.

**Padrão de interfaces e bindings:** Todos os MCPs seguem o padrão do Deco Runtime com interfaces bem definidas, StateSchema para configuração e sistema de bindings para integração entre apps

## Comando Rápido

```bash
bun scripts/new.ts <nome-do-mcp>
```

O script vai perguntar se você quer uma view (interface web). Responda `y` para sim ou `n` para não.

**Opções:**
- `--no-view` - Cria MCP sem interface (apenas API)
- `--template minimal` - Usa template mínimo
- `--description "Descrição"` - Define descrição customizada

## Estrutura de um MCP

```
meu-mcp/
├── server/
│   ├── main.ts              # Entry point principal
│   ├── tools/
│   │   ├── index.ts         # Exporta todas as tools
│   │   ├── minha-tool.ts    # Implementação das tools
│   │   └── utils/           # (opcional) utilitários auxiliares
│   └── lib/                 # (opcional) clientes e libs externas
├── shared/
│   └── deco.gen.ts          # Tipos gerados automaticamente
├── package.json
├── wrangler.toml            # Config do Cloudflare Workers
└── tsconfig.json
```

Se incluir view:
```
├── view/                     # Frontend React
│   └── src/
├── index.html
└── vite.config.ts
```

## Configuração Básica

### 1. main.ts
Define o StateSchema (configurações que o usuário preenche na instalação):

```typescript
export const StateSchema = BaseStateSchema.extend({
  apiKey: z.string().describe("Sua API key"),
  // ... outros campos
});
```

### 2. tools/index.ts
Exporta as tools que serão disponibilizadas:

```typescript
import { userTools } from "@decocms/mcps-shared/tools/user";
import { minhasTool } from "./minha-tool.ts";

export const tools = [
  ...userTools,
  ...minhasTool,
];
```

### 3. Implementar Tools
Crie arquivos em `server/tools/` com suas ferramentas usando o padrão MCP.

## Após Criar

```bash
cd meu-mcp
bun install
bun run dev     # Desenvolvimento local
bun run deploy  # Deploy para produção
```

## Exemplos de Referência

- **Minimal:** `template-minimal/` - MCP sem interface
- **Com View:** `template-with-view/` - MCP com interface web
- **Real:** `pinecone/`, `sora/`, `object-storage/` - MCPs em produção

