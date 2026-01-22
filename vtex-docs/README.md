# VTEX Docs MCP

RAG-based MCP for searching and querying VTEX documentation using semantic search and AI-generated answers.

## Features

- **VTEX_DOCS_ASSISTANT**: Ask questions about VTEX and get AI-generated answers based on the documentation
- **VTEX_DOCS_SEARCH**: Search VTEX documentation and retrieve relevant chunks

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

# Mesh (for chat model)
MESH_ORGANIZATION_ID=your_org_id
MESH_CONNECTION_ID=your_connection_id
MESH_API_KEY=your_mesh_api_key
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

### VTEX_DOCS_ASSISTANT

Ask questions and get AI-generated answers with sources.

**Input:**
- `question` (string): The question about VTEX
- `language` (optional): "en" or "pt-br"

**Output:**
- `answer`: AI-generated answer
- `sources`: Array of source documents

### VTEX_DOCS_SEARCH

Raw semantic search for documentation chunks.

**Input:**
- `query` (string): Search query
- `language` (optional): "en" or "pt-br"
- `limit` (optional): Number of results (1-20, default: 5)

**Output:**
- `results`: Array of matching documents with content, title, source, section, and similarity score
