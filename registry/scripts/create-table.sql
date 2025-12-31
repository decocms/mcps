-- ═══════════════════════════════════════════════════════════════
-- MCP Servers Table for Registry
-- 
-- This table stores ALL data from the MCP Registry API plus
-- additional metadata from the Mesh (tags, categories, etc.)
-- 
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mcp_servers (
  -- ═══════════════════════════════════════════════════════════════
  -- DADOS ORIGINAIS DO REGISTRY (indexados)
  -- ═══════════════════════════════════════════════════════════════
  
  -- Identificação (chave primária composta para suportar múltiplas versões)
  name TEXT NOT NULL,                     -- "ai.exa/exa"
  version TEXT NOT NULL,                  -- "3.1.3"
  PRIMARY KEY (name, version),
  schema_url TEXT,                        -- "$schema" URL
  
  -- Conteúdo
  description TEXT,                       -- Descrição original do registry (duplicada em short_description)
  website_url TEXT,
  
  -- Objetos complexos (JSONB para queries flexíveis)
  repository JSONB,                       -- {"url": "...", "source": "github"}
  remotes JSONB,                          -- [{"type": "streamable-http", "url": "..."}]
  packages JSONB,                         -- [{"type": "npm", "name": "..."}]
  icons JSONB,                            -- [{"src": "...", "mimeType": "..."}]
  
  -- Metadados oficiais do registry
  registry_status TEXT DEFAULT 'active',  -- status do registry oficial
  published_at TIMESTAMPTZ,
  registry_updated_at TIMESTAMPTZ,
  is_latest BOOLEAN DEFAULT TRUE,
  
  -- ═══════════════════════════════════════════════════════════════
  -- DADOS EXTRAS DA MESH (agregados)
  -- ═══════════════════════════════════════════════════════════════
  
  -- Metadados descritivos enriquecidos
  friendly_name TEXT,                     -- Nome amigável para UI
  short_description TEXT,                 -- Cópia do description (para consistência com outros campos mesh)
  mesh_description TEXT,                  -- Descrição completa markdown (será populada por IA/manual)
  tags TEXT[],                            -- ["search", "web", "ai"]
  categories TEXT[],                      -- ["productivity", "research"]
  
  -- Flags da Mesh (curadas manualmente ou por AI)
  verified BOOLEAN DEFAULT FALSE,         -- Verificado pela mesh
  unlisted BOOLEAN DEFAULT TRUE,          -- TRUE = não aparece (padrão), FALSE = aparece (allowlist)
  has_oauth BOOLEAN DEFAULT FALSE,        -- Requer OAuth/autenticação
  
  -- Flags computadas (preenchidas pelo script de sync)
  has_remote BOOLEAN DEFAULT FALSE,       -- remotes IS NOT NULL AND jsonb_array_length(remotes) > 0
  is_npm BOOLEAN DEFAULT FALSE,           -- packages contém type: "npm"
  is_local_repo BOOLEAN DEFAULT FALSE,    -- só tem repository, sem remote/npm
  
  -- ═══════════════════════════════════════════════════════════════
  -- CONTROLE INTERNO
  -- ═══════════════════════════════════════════════════════════════
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Filtros principais
CREATE INDEX IF NOT EXISTS idx_mcp_servers_is_latest ON mcp_servers(is_latest);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_verified ON mcp_servers(verified);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_unlisted ON mcp_servers(unlisted);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_has_remote ON mcp_servers(has_remote);

-- Índice composto para listagem (query mais comum: is_latest=true + unlisted=false)
CREATE INDEX IF NOT EXISTS idx_mcp_servers_listing ON mcp_servers(is_latest, unlisted, verified DESC, name);

-- Busca por arrays
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tags ON mcp_servers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_categories ON mcp_servers USING GIN(categories);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_mcp_servers_search ON mcp_servers USING GIN(
  to_tsvector('english', coalesce(name, '') || ' ' || 
              coalesce(description, '') || ' ' || 
              coalesce(friendly_name, '') || ' ' ||
              coalesce(short_description, ''))
);

-- Ordenação comum (deprecated - use idx_mcp_servers_listing)
-- CREATE INDEX IF NOT EXISTS idx_mcp_servers_verified_name ON mcp_servers(verified DESC, name);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES (Row Level Security)
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anon key)
CREATE POLICY "Allow public read access" ON mcp_servers
    FOR SELECT
    USING (true);

-- Allow authenticated users to insert/update (service role key)
CREATE POLICY "Allow service role full access" ON mcp_servers
    FOR ALL
    USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE mcp_servers IS 'MCP servers indexed from the official registry with mesh metadata';
COMMENT ON COLUMN mcp_servers.name IS 'Unique server name from registry (e.g., ai.exa/exa)';
COMMENT ON COLUMN mcp_servers.verified IS 'Whether the server is verified by mesh';
COMMENT ON COLUMN mcp_servers.unlisted IS 'TRUE = hidden (default for new servers), FALSE = visible (allowlist servers)';

