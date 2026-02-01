# Content Scraper MCP

MCP para listar e consultar conteúdo coletado de múltiplas fontes armazenado em um banco de dados.

## Funcionalidades

- **Múltiplas Fontes**: Consulta conteúdo de diferentes origens (web, Reddit, LinkedIn, Twitter)
- **Paginação**: Suporte a paginação por range de índices
- **Filtro por Semana**: Opção de filtrar apenas conteúdo da última semana
- **Query Flexível**: Busca em tabela específica ou em todas de uma vez

## Configuração

### 1. Banco de Dados

O MCP espera um banco de dados com as seguintes tabelas:

- `contents` - Conteúdo geral da web
- `reddit_content_scrape` - Conteúdo coletado do Reddit
- `linkedin_content_scrape` - Conteúdo coletado do LinkedIn
- `twitter_content_scrape` - Conteúdo coletado do Twitter

### 2. Instalar o MCP

Ao instalar, configure:
- `database.apiUrl`: URL da API do banco de dados
- `database.token`: Token de autenticação

## Tools Disponíveis

### `LIST_SCRAPED_CONTENT`

Lista conteúdo já coletado e salvo no banco de dados.

**Input:**
```json
{
  "table": "all",
  "startIndex": 1,
  "endIndex": 100,
  "onlyThisWeek": false
}
```

**Parâmetros:**
- `table`: Qual fonte consultar - `"all"`, `"contents"`, `"reddit"`, `"linkedin"`, ou `"twitter"`
- `startIndex`: Índice inicial (padrão: 1)
- `endIndex`: Índice final (padrão: 100)
- `onlyThisWeek`: Se `true`, retorna apenas conteúdo da última semana

**Output:**
```json
{
  "success": true,
  "results": [
    {
      "table": "contents",
      "data": [...],
      "count": 50
    },
    {
      "table": "reddit",
      "data": [...],
      "count": 30
    }
  ],
  "totalCount": 80,
  "range": {
    "startIndex": 1,
    "endIndex": 100
  }
}
```

## Desenvolvimento

```bash
cd content-scraper-mcp
bun install
bun run dev     # Desenvolvimento local
bun run deploy  # Deploy para produção
```

## Arquitetura

```
content-scraper-mcp/
├── server/
│   ├── main.ts              # Entry point e StateSchema
│   ├── lib/
│   │   └── db-client.ts     # Cliente para o banco de dados
│   ├── tools/
│   │   ├── index.ts         # Exporta todas as tools
│   │   └── content-scrape.ts # Tool de listagem de conteúdo
│   └── types/
│       └── env.ts           # Tipos de ambiente
├── package.json
└── tsconfig.json
```
