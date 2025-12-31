-- Postgres Memory Schema
-- Enable pgvector extension (requires pg 14+ with pgvector installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memories table
-- Stores all memory entries with embeddings for semantic search
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Source tracking (agent, manual, import, derived)
  source_type TEXT NOT NULL DEFAULT 'agent',
  source_id TEXT,
  source_url TEXT,
  
  -- Content
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  
  -- Metadata
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Embedding vector (dimension is configurable, common: 1536 for OpenAI, 1024 for many others)
  -- We use 1536 as default but this can be changed based on your embedding model
  embedding vector(1536) NOT NULL,
  
  -- Ensure unique content per namespace (deduplication)
  CONSTRAINT memories_namespace_content_hash_unique UNIQUE (namespace, content_hash)
);

-- Create memory_edges table
-- Stores relationships between memories (graph structure)
CREATE TABLE IF NOT EXISTS memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Edge endpoints
  from_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  
  -- Relationship type
  rel_type TEXT NOT NULL CHECK (rel_type IN ('updates', 'extends', 'derives', 'mentions')),
  
  -- Edge weight (for weighted graph traversal)
  weight REAL NOT NULL DEFAULT 1.0,
  
  -- Additional edge metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for memories table
-- HNSW index for fast vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw 
  ON memories USING hnsw (embedding vector_cosine_ops);

-- B-tree indexes for common queries
CREATE INDEX IF NOT EXISTS memories_namespace_created_at_idx 
  ON memories (namespace, created_at DESC);

CREATE INDEX IF NOT EXISTS memories_source_type_idx 
  ON memories (namespace, source_type);

CREATE INDEX IF NOT EXISTS memories_content_hash_idx 
  ON memories (namespace, content_hash);

-- GIN index for tags array search
CREATE INDEX IF NOT EXISTS memories_tags_gin_idx 
  ON memories USING GIN (tags);

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS memories_metadata_gin_idx 
  ON memories USING GIN (metadata);

-- Indexes for memory_edges table
CREATE INDEX IF NOT EXISTS memory_edges_namespace_from_idx 
  ON memory_edges (namespace, from_id);

CREATE INDEX IF NOT EXISTS memory_edges_namespace_to_idx 
  ON memory_edges (namespace, to_id);

CREATE INDEX IF NOT EXISTS memory_edges_namespace_rel_type_idx 
  ON memory_edges (namespace, rel_type);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on memories
DROP TRIGGER IF EXISTS memories_updated_at_trigger ON memories;
CREATE TRIGGER memories_updated_at_trigger
  BEFORE UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_memories_updated_at();

-- Optional: Create a view for memory search results with computed similarity
-- This is useful for debugging but not required
CREATE OR REPLACE VIEW memory_search_example AS
SELECT 
  id,
  namespace,
  title,
  content,
  tags,
  metadata,
  source_type,
  source_url,
  created_at
FROM memories
WHERE namespace = 'example';

