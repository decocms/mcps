# Reddit MCP

MCP server para interagir com o Reddit. Permite buscar posts de subreddits e pesquisar conteúdo.

## Tools Disponíveis

### GET_SUBREDDIT_POSTS

Busca posts de um subreddit específico.

**Parâmetros:**
- `subreddit` (obrigatório): Nome do subreddit (sem o "r/"). Ex: "mcp", "programming", "news"
- `sort` (opcional): Como ordenar os posts - "hot", "new", "top", "rising" (padrão: "hot")
- `time` (opcional): Filtro de tempo para ordenação "top" - "hour", "day", "week", "month", "year", "all"
- `limit` (opcional): Número de posts a retornar (1-100, padrão: 25)
- `after` (opcional): Cursor para paginação

**Exemplo de uso:**
```
Busque os posts mais recentes do r/mcp
```

### SEARCH_REDDIT

Pesquisa posts no Reddit por termo de busca.

**Parâmetros:**
- `query` (obrigatório): Termo de busca
- `subreddit` (opcional): Limitar busca a um subreddit específico
- `sort` (opcional): Como ordenar - "relevance", "hot", "top", "new", "comments" (padrão: "relevance")
- `time` (opcional): Filtro de tempo - "hour", "day", "week", "month", "year", "all" (padrão: "all")
- `limit` (opcional): Número de resultados (1-100, padrão: 25)
- `after` (opcional): Cursor para paginação

**Exemplo de uso:**
```
Pesquise por "MCP server" no Reddit
Busque posts sobre "AI agents" no r/LocalLLaMA
```

## Instalação

Este MCP não requer configuração adicional - utiliza a API pública do Reddit que não requer autenticação.

## Desenvolvimento

```bash
# Instalar dependências
bun install

# Rodar em desenvolvimento
bun run dev

# Verificar tipos
bun run check

# Deploy
bun run deploy
```


