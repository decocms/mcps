# Deco News Weekly Digest MCP

MCP para gerenciar artigos do digest semanal para as notícias da deco.cx.

## Funcionalidades

Este MCP fornece as seguintes ferramentas:

### `LIST_WEEKLY_DIGEST`

Lista artigos do digest semanal com suporte a:

- Paginação (`limit` e `offset`)
- Filtro por status (`draft`, `pending_review`, `approved`, `published`, `archived`)
- Filtro por categoria
- Busca por título/conteúdo
- Ordenação personalizável

### `SAVE_WEEKLY_DIGEST_ARTICLE`

Salva um novo artigo no digest com todos os campos:

- URL (única)
- Título, conteúdo, resumo
- Campos SEO (meta_title, meta_description, keywords)
- Categoria e tags
- Autor e tempo de leitura
- Imagem principal

### `UPDATE_WEEKLY_DIGEST_ARTICLE`

Atualiza um artigo existente por ID ou URL.

### `GET_WEEKLY_DIGEST_ARTICLE`

Busca um artigo específico por ID, URL ou slug.

### `DELETE_WEEKLY_DIGEST_ARTICLE`

Remove um artigo por ID ou URL.

### `PUBLISH_WEEKLY_DIGEST_ARTICLE`

Publica um artigo, alterando o status para `published` e definindo `published_at`.

## Configuração

O MCP requer as seguintes configurações:

```json
{
  "database": {
    "apiUrl": "URL da API do MCP para executar queries SQL",
    "token": "Token de autenticação Bearer"
  }
}
```

## Estrutura da Tabela

O MCP usa a tabela `deco_weekly_report`:

```sql
CREATE TABLE "deco_weekly_report" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE,
  title TEXT,
  source_title TEXT,
  status TEXT,
  created_at TEXT,
  content TEXT,
  slug TEXT,
  summary TEXT,
  key_points TEXT,
  meta_title TEXT,
  meta_description TEXT,
  keywords TEXT,
  category TEXT,
  tags TEXT,
  author TEXT,
  reading_time INTEGER,
  published_at DATETIME,
  image_url TEXT,
  image_alt_text TEXT,
  UNIQUE (url)
);
```

## Categorias Disponíveis

- AI & Machine Learning
- eCommerce
- Developer Tools
- Platform Updates
- Community
- Tutorials
- Case Studies
- Industry News

## Status dos Artigos

- `draft` - Rascunho
- `pending_review` - Aguardando revisão
- `approved` - Aprovado
- `published` - Publicado
- `archived` - Arquivado

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Executar em modo de desenvolvimento
npm run dev

# Build para produção
npm run build

# Deploy
npm run deploy
```

## Licença

MIT

