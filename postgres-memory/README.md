# Postgres Memory MCP

A minimal, production-ready MCP server for AI memory storage using **Postgres + pgvector**. Inspired by [Supermemory](https://supermemory.ai) and [Graphiti](https://github.com/getzep/graphiti) — designed to be 90% as powerful with 10% of the mental overhead.

## Features

- 🧠 **Semantic Search**: Vector similarity search using pgvector with HNSW indexing
- 🏷️ **Namespacing**: Isolate memories per org, project, or user
- 🔗 **Graph Relationships**: Link memories with typed edges (updates, extends, derives, mentions)
- 🔄 **Automatic Deduplication**: Content-based hashing prevents duplicates
- 📊 **OpenRouter Compatible**: Works with any OpenAI-compatible embeddings API
- 🚀 **Bun-first**: Optimized for Bun runtime, Node 20+ compatible

## Quick Start

### 1. Install dependencies

```bash
cd mcps/postgres-memory
bun install
```

### 2. Setup Database

You need a Postgres database with pgvector extension. If using **Supabase**:

1. Go to your Supabase project → SQL Editor
2. Run the contents of `server/schema.sql`

Or with any Postgres 14+:

```sql
-- Enable pgvector (requires pgvector extension installed)
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the full schema:

```bash
# Using psql
psql $DATABASE_URL -f server/schema.sql
```

### 3. Configure Environment

Create a `.env` file:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database

# Embeddings (OpenRouter example)
EMBEDDINGS_BASE_URL=https://openrouter.ai/api/v1
EMBEDDINGS_API_KEY=sk-or-v1-your-key
EMBEDDINGS_MODEL=openai/text-embedding-3-small
EMBEDDINGS_DIM=1536

# Optional
PORT=8001
```

**Alternative Embeddings Providers:**

```bash
# OpenAI
EMBEDDINGS_BASE_URL=https://api.openai.com/v1
EMBEDDINGS_API_KEY=sk-your-key
EMBEDDINGS_MODEL=text-embedding-3-small
EMBEDDINGS_DIM=1536

# Ollama (local)
EMBEDDINGS_BASE_URL=http://localhost:11434/v1
EMBEDDINGS_API_KEY=ollama
EMBEDDINGS_MODEL=nomic-embed-text
EMBEDDINGS_DIM=768
```

### 4. Run the Server

```bash
# Development with hot reload
bun run dev

# Production
bun run build
bun run dist/server/main.js
```

## MCP Tools

### `memory.add`

Add a new memory with automatic embedding generation.

**Input:**
```json
{
  "namespace": "org:acme",
  "content": "The quick brown fox jumps over the lazy dog",
  "title": "Sample Text",
  "tags": ["sample", "test"],
  "source_type": "manual",
  "source_url": "https://example.com/source",
  "metadata": { "category": "demo" },
  "dedupe": true
}
```

**Output:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2024-12-31T10:00:00.000Z",
  "updated_at": "2024-12-31T10:00:00.000Z",
  "tags": ["sample", "test"],
  "metadata": { "category": "demo" },
  "deduplicated": false
}
```

### `memory.get`

Retrieve a specific memory by ID.

**Input:**
```json
{
  "namespace": "org:acme",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
```json
{
  "memory": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "namespace": "org:acme",
    "created_at": "2024-12-31T10:00:00.000Z",
    "updated_at": "2024-12-31T10:00:00.000Z",
    "source_type": "manual",
    "source_id": null,
    "source_url": "https://example.com/source",
    "title": "Sample Text",
    "content": "The quick brown fox jumps over the lazy dog",
    "tags": ["sample", "test"],
    "metadata": { "category": "demo" }
  }
}
```

### `memory.search`

Semantic search for memories.

**Input:**
```json
{
  "namespace": "org:acme",
  "query": "fast fox jumping",
  "topK": 5,
  "tagFilter": ["sample"],
  "includeNeighbors": true,
  "neighborsHop": 1
}
```

**Output:**
```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "score": 0.92,
      "title": "Sample Text",
      "content": "The quick brown fox jumps over the lazy dog",
      "tags": ["sample", "test"],
      "metadata": { "category": "demo" },
      "created_at": "2024-12-31T10:00:00.000Z",
      "source_url": "https://example.com/source",
      "source_type": "manual"
    }
  ],
  "related": []
}
```

### `memory.link`

Create relationships between memories.

**Input:**
```json
{
  "namespace": "org:acme",
  "from_id": "550e8400-e29b-41d4-a716-446655440000",
  "to_id": "660e8400-e29b-41d4-a716-446655440001",
  "rel_type": "extends",
  "weight": 1.0,
  "metadata": { "reason": "continuation" }
}
```

**Output:**
```json
{
  "edge_id": "770e8400-e29b-41d4-a716-446655440002",
  "created_at": "2024-12-31T10:05:00.000Z"
}
```

## Namespacing Best Practices

Use hierarchical namespaces for clean isolation:

```
org:{org_id}                    # Organization-level memories
org:{org_id}:project:{proj_id}  # Project-level memories
user:{user_id}                  # User-level memories
agent:{agent_id}                # Agent-specific memories
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Client (Claude, etc.)            │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 Postgres Memory MCP                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ memory.add  │  │ memory.search│  │  memory.link   │  │
│  │ memory.get  │  │              │  │                │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │          │
│         ▼                ▼                   ▼          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Embeddings Provider                 │    │
│  │         (OpenRouter / OpenAI / Ollama)          │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │               Postgres + pgvector                │    │
│  │  ┌────────────────┐  ┌────────────────────────┐ │    │
│  │  │   memories     │──│    memory_edges        │ │    │
│  │  │  (with HNSW)   │  │   (graph structure)    │ │    │
│  │  └────────────────┘  └────────────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Database Setup

### Option 1: Supabase (Recommended)

1. **Create a new Supabase project** or use an existing one

2. **Enable pgvector extension:**
   - Go to Database → Extensions
   - Search for "vector" and enable it

3. **Run the schema:**
   - Go to SQL Editor
   - Create a new query
   - Paste the contents of `server/schema.sql`
   - Run

4. **Get connection string:**
   - Go to Settings → Database
   - Copy the connection string (use "Session pooler" for transactions)

### Option 2: Local PostgreSQL with Docker

If you're running the MCP Mesh locally, you can set up a Postgres container with pgvector:

```bash
# Create a docker-compose.yml for local Postgres with pgvector
cat > docker-compose.postgres.yml << 'EOF'
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: mesh
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF

# Start Postgres
docker-compose -f docker-compose.postgres.yml up -d

# Apply schema
psql postgresql://postgres:postgres@localhost:5432/mesh -f server/schema.sql
```

Then set your environment:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mesh
```

### Option 3: Existing Mesh PostgreSQL

If you're already running MCP Mesh with PostgreSQL, you can share the same database:

1. Connect to your Mesh database
2. Run `server/schema.sql` to create the memories tables
3. Use the same `DATABASE_URL` for both services

**Note:** The memories tables (`memories`, `memory_edges`) don't conflict with Mesh tables

## Performance Tips

1. **Batch embeddings**: The embeddings API supports batching. When adding multiple memories, batch them together.

2. **Index tuning**: For large datasets (>100k memories), tune the HNSW index parameters:
   ```sql
   CREATE INDEX memories_embedding_hnsw 
     ON memories USING hnsw (embedding vector_cosine_ops)
     WITH (m = 16, ef_construction = 64);
   ```

3. **Connection pooling**: Use a connection pooler (Supabase has this built-in) for production.

## Using with MCP Mesh

### As a Custom Command Connection

In the MCP Mesh UI, add a new connection:

1. **Type**: Command
2. **Command**: `bun`
3. **Args**: `/path/to/mcps/postgres-memory/server/main.ts --stdio`
4. **Environment**:
   ```
   DATABASE_URL=postgresql://...
   EMBEDDINGS_BASE_URL=https://openrouter.ai/api/v1
   EMBEDDINGS_API_KEY=sk-or-v1-...
   EMBEDDINGS_MODEL=openai/text-embedding-3-small
   ```

### As an HTTP Service

Run the server and add as a Web connection:

```bash
cd mcps/postgres-memory
bun run dev
```

Then add in Mesh:
- **Type**: Web
- **URL**: `http://localhost:8001/mcp`

## Related Projects

- [Supermemory](https://supermemory.ai) - Memory API for the AI era
- [Graphiti](https://github.com/getzep/graphiti) - Knowledge graphs for AI agents
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search for Postgres

## License

MIT

