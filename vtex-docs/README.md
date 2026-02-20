# VTEX Docs MCP  

RAG-based MCP for searching VTEX documentation using hybrid search (semantic + full-text).

## Features

- **VTEX_DOCS_SEARCH**: Search VTEX documentation using hybrid search and retrieve relevant chunks

## Setup

### 1. Supabase Database

Run the SQL script to set up the required tables and functions:

```bash
# Copy the contents of scripts/setup.sql and run in your Supabase SQL editor
```

### 2. Environment Variables

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_api_key
```

### 3. Index Documentation

Clone or download the VTEX documentation, then run:

```bash


bun run index ./path/to/vtex-docs
```

## Development

```bash
bun install
bun run dev
```

## Deployment

```bash
bun run deploy
```

## Tools

### VTEX_DOCS_SEARCH

Hybrid search (semantic + full-text) for documentation chunks.

**Input:**
- `query` (string): Search query in natural language
- `language` (optional): "en" or "pt-br"
- `limit` (optional): Number of results (1-20, default: 8)
- `semanticWeight` (optional): Weight for semantic vs full-text search (0-1, default: 0.3)

**Output:**
- `results`: Array of matching documents with:
  - `content`: The chunk content
  - `title`: Document title
  - `source`: File path
  - `section`: Documentation section
  - `similarity`: Semantic similarity score
  - `ftsRank`: Full-text search rank
  - `hybridScore`: Combined score
