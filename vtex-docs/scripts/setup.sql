-- Enable pgvector extension
create extension if not exists vector;

-- Create table for documentation chunks
-- Using halfvec for half-precision vectors (16-bit) - supports up to 4000 dimensions with indexes
create table if not exists doc_chunks (
  id bigserial primary key,
  content text not null,
  metadata jsonb not null default '{}',
  embedding halfvec(3072), -- text-embedding-3-large with half-precision
  created_at timestamptz default now()
);

-- Create index for similarity search using HNSW (better for halfvec)
create index if not exists doc_chunks_embedding_idx
  on doc_chunks
  using hnsw (embedding halfvec_cosine_ops);

-- Create index on metadata for filtering
create index if not exists doc_chunks_metadata_idx
  on doc_chunks
  using gin (metadata);

-- Function for similarity search
create or replace function match_documents(
  query_embedding halfvec(3072),
  match_threshold float default 0.7,
  match_count int default 10,
  filter_metadata jsonb default '{}'
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    doc_chunks.id,
    doc_chunks.content,
    doc_chunks.metadata,
    1 - (doc_chunks.embedding <=> query_embedding) as similarity
  from doc_chunks
  where
    1 - (doc_chunks.embedding <=> query_embedding) > match_threshold
    and (filter_metadata = '{}' or doc_chunks.metadata @> filter_metadata)
  order by doc_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Function to delete docs by source file (useful for re-indexing)
create or replace function delete_docs_by_source(source_path text)
returns void
language plpgsql
as $$
begin
  delete from doc_chunks where metadata->>'source' = source_path;
end;
$$;

-- ============================================
-- HYBRID SEARCH (Semantic + Full-Text Search)
-- ============================================

-- Add full-text search column (auto-generated from content)
-- Using 'simple' config for language-agnostic tokenization (works with EN/PT-BR)
alter table doc_chunks
add column if not exists fts tsvector
generated always as (
  setweight(to_tsvector('simple', coalesce(metadata->>'title', '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(content, '')), 'B')
) stored;

-- Create GIN index for fast full-text search
create index if not exists doc_chunks_fts_idx
on doc_chunks using gin (fts);

-- Hybrid search function using Reciprocal Rank Fusion (RRF)
-- RRF combines rankings without needing score normalization
create or replace function hybrid_search(
  query_text text,
  query_embedding halfvec(3072),
  match_count int default 10,
  rrf_k int default 60,
  semantic_weight float default 0.5,
  filter_metadata jsonb default '{}'
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float,
  fts_rank float,
  hybrid_score float
)
language sql
as $$
with semantic_search as (
  select
    doc_chunks.id,
    row_number() over (order by doc_chunks.embedding <=> query_embedding) as rank
  from doc_chunks
  where filter_metadata = '{}' or doc_chunks.metadata @> filter_metadata
  order by doc_chunks.embedding <=> query_embedding
  limit match_count * 2
),
fulltext_search as (
  select
    doc_chunks.id,
    row_number() over (order by ts_rank(doc_chunks.fts, websearch_to_tsquery('simple', query_text)) desc) as rank
  from doc_chunks
  where
    doc_chunks.fts @@ websearch_to_tsquery('simple', query_text)
    and (filter_metadata = '{}' or doc_chunks.metadata @> filter_metadata)
  order by ts_rank(doc_chunks.fts, websearch_to_tsquery('simple', query_text)) desc
  limit match_count * 2
),
rrf_scores as (
  select
    coalesce(s.id, f.id) as id,
    coalesce(1.0 / (rrf_k + s.rank), 0.0) * semantic_weight as semantic_rrf,
    coalesce(1.0 / (rrf_k + f.rank), 0.0) * (1 - semantic_weight) as fulltext_rrf
  from semantic_search s
  full outer join fulltext_search f on s.id = f.id
)
select
  d.id,
  d.content,
  d.metadata,
  1 - (d.embedding <=> query_embedding) as similarity,
  ts_rank(d.fts, websearch_to_tsquery('simple', query_text)) as fts_rank,
  (r.semantic_rrf + r.fulltext_rrf) as hybrid_score
from rrf_scores r
join doc_chunks d on d.id = r.id
order by hybrid_score desc
limit match_count;
$$;
