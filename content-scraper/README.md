# Content Scraper MCP

MCP para extração, deduplicação e sumarização de conteúdo web usando Firecrawl e Supabase.


## Funcionalidades

- **Extração de Conteúdo**: Usa Firecrawl para extrair title, body, author e date de URLs
- **Deduplicação por Fingerprint**: Gera hash SHA-256 de title + body para identificar conteúdo único
- **Persistência de Estado**: Armazena registros no Supabase para evitar reprocessamento
- **Watermarks por Domínio**: Rastreia última vez que cada domínio foi processado
- **Resumos Focados em Insights**: Gera resumos curtos extraindo frases-chave

## Configuração

### 1. Supabase - Criar Tabelas

Execute no SQL Editor do seu projeto Supabase:

```sql
-- Tabela de conteúdo processado
CREATE TABLE scraped_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  fingerprint TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  updated_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_scraped_content_domain ON scraped_content(domain);
CREATE INDEX idx_scraped_content_fingerprint ON scraped_content(fingerprint);
CREATE INDEX idx_scraped_content_url ON scraped_content(url);

-- Tabela de watermarks por domínio
CREATE TABLE scraper_watermarks (
  domain TEXT PRIMARY KEY,
  last_processed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Firecrawl API Key

Obtenha sua API key em https://firecrawl.dev

### 3. Instalar o MCP

Ao instalar, preencha:
- `firecrawlApiKey`: Sua chave de API do Firecrawl
- `supabaseUrl`: URL do seu projeto Supabase (ex: https://xxx.supabase.co)
- `supabaseKey`: Service role key ou anon key com RLS configurado

## Tools Disponíveis

### `process_urls`

Processa uma lista de URLs:
- Extrai conteúdo limpo usando Firecrawl
- Gera fingerprint único (SHA-256 de title + body normalizado)
- Verifica se já existe no Supabase
- Salva novo conteúdo ou atualiza se fingerprint mudou
- Retorna resumo focado em insights

**Input:**
```json
{
  "urls": ["https://example.com/article-1", "https://example.com/article-2"],
  "generateSummaries": true
}
```

**Output:**
```json
{
  "processed": [
    {
      "url": "https://example.com/article-1",
      "status": "new",
      "title": "Article Title",
      "summary": "Key insights from the content...",
      "fingerprint": "abc123...",
      "domain": "example.com"
    }
  ],
  "stats": {
    "total": 2,
    "new": 1,
    "updated": 0,
    "unchanged": 1,
    "errors": 0
  }
}
```

### `check_updates`

Verifica status de URLs processadas anteriormente sem re-extrair:

**Input:**
```json
{
  "domain": "example.com"
}
```

### `get_watermarks`

Obtém watermarks (última vez processada) por domínio:

**Input:**
```json
{
  "domain": "example.com"
}
```

## Lógica de Deduplicação

1. **Normalização**: title e body são normalizados (lowercase, whitespace colapsado, Unicode normalizado)
2. **Fingerprint**: SHA-256 do texto normalizado `title|body`
3. **Verificação**:
   - Se URL não existe → conteúdo **novo**
   - Se URL existe mas fingerprint diferente → **update**
   - Se URL existe e fingerprint igual → **ignorar**

## Desenvolvimento

```bash
cd content-scraper
bun install
bun run dev     # Desenvolvimento local
bun run deploy  # Deploy para produção
```

## Arquitetura

```
content-scraper/
├── server/
│   ├── main.ts              # Entry point e StateSchema
│   ├── lib/
│   │   ├── firecrawl.ts     # Cliente Firecrawl API
│   │   ├── supabase.ts      # Cliente Supabase para persistência
│   │   ├── content.ts       # Normalização, fingerprint, resumo
│   │   └── types.ts         # Tipos compartilhados
│   └── tools/
│       ├── index.ts         # Exporta todas as tools
│       └── scraper.ts       # Tools de processamento
├── shared/
│   └── deco.gen.ts          # Tipos gerados
├── package.json
├── wrangler.toml
└── tsconfig.json
```
