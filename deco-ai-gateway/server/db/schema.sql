-- ============================================================================
-- SUPABASE SETUP COMPLETO - Deco AI Gateway MCP
-- ============================================================================
--
-- PARTE 0: Limpeza de policies existentes (execução segura)
-- PARTE 1: Criação das tabelas
-- PARTE 2: Row Level Security (RLS) policies
-- PARTE 3: Migrações (para tabelas existentes)
--
-- IMPORTANTE: llm_gateway_connections NUNCA é acessível via tools!
-- Contém API keys criptografadas que só o código interno pode acessar.
--
-- ============================================================================

-- ============================================================================
-- PARTE 0: LIMPEZA DE POLICIES EXISTENTES
-- ============================================================================
-- Remove todas as policies existentes para permitir re-execução do script

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN (
      'llm_gateway_connections'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- PARTE 1: CRIAÇÃO DAS TABELAS
-- ============================================================================

-- 1. llm_gateway_connections (configurações e API keys criptografadas)
CREATE TABLE IF NOT EXISTS llm_gateway_connections (
  connection_id        TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL,
  mesh_url             TEXT NOT NULL,
  openrouter_key_name  TEXT,                          -- Nome da key no OpenRouter (ex: deco-org-abc123)
  openrouter_key_hash  TEXT,                          -- Hash retornado pelo OpenRouter (para revogar sem expor a key)
  encrypted_api_key    TEXT,                          -- API key criptografada com AES-256-GCM (base64)
  encryption_iv        TEXT,                          -- Initialization Vector de 12 bytes (hex)
  encryption_tag       TEXT,                          -- Auth tag de 16 bytes para verificação de integridade (hex)
  configured_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_gw_org
  ON llm_gateway_connections(organization_id);

CREATE INDEX IF NOT EXISTS idx_llm_gw_key_hash
  ON llm_gateway_connections(openrouter_key_hash);

CREATE INDEX IF NOT EXISTS idx_llm_gw_updated
  ON llm_gateway_connections(updated_at DESC);

COMMENT ON TABLE llm_gateway_connections IS
  '⚠️  SENSITIVE: Contains encrypted OpenRouter API keys. NEVER create MCP tools that access this table. Internal code access only.';

COMMENT ON COLUMN llm_gateway_connections.encrypted_api_key IS
  'API key do OpenRouter criptografada com AES-256-GCM. Descriptografar apenas em memória no servidor.';

COMMENT ON COLUMN llm_gateway_connections.openrouter_key_hash IS
  'Hash da API key retornado pelo OpenRouter. Usar para revogar a key sem precisar descriptografar.';

-- ============================================================================
-- PARTE 2: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- ============================================================================
-- 1. LLM_GATEWAY_CONNECTIONS - ACESSO INTERNO APENAS
-- ============================================================================

-- ⚠️  IMPORTANTE: NUNCA criar tools MCP que acessam esta tabela!
-- Contém API keys criptografadas. Acesso apenas via código interno.
-- Proteção: disciplina de não criar tools para esta tabela.

-- RLS habilitado com acesso total via código interno (ANON key)
-- Não há tools que acessam esta tabela (proteção por disciplina)
ALTER TABLE llm_gateway_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow internal code full access to llm_gateway_connections"
  ON llm_gateway_connections FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RESUMO DE PERMISSÕES
-- ============================================================================

/*
┌──────────────────────────────┬───────┬────────┬────────┬────────┐
│ Tabela                       │ READ  │ INSERT │ UPDATE │ DELETE │
├──────────────────────────────┼───────┼────────┼────────┼────────┤
│ llm_gateway_connections      │  🔒   │   🔒   │   🔒   │   🔒   │ <- NO TOOLS!
└──────────────────────────────┴───────┴────────┴────────┴────────┘

IMPORTANTE:
- llm_gateway_connections = NUNCA criar tools que acessam! Só código interno.
- API keys são criptografadas com AES-256-GCM antes de gravar no banco
- ENCRYPTION_KEY nunca vai para o banco, fica apenas em variável de ambiente
- openrouter_key_hash permite revogar a key no OpenRouter sem expor a key em si
*/

-- ============================================================================
-- PARTE 3: MIGRAÇÕES (para tabelas existentes)
-- ============================================================================

-- Migração: Adicionar coluna openrouter_key_hash (caso tabela já exista sem ela)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
    AND column_name = 'openrouter_key_hash'
  ) THEN
    ALTER TABLE llm_gateway_connections
    ADD COLUMN openrouter_key_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_llm_gw_key_hash
      ON llm_gateway_connections(openrouter_key_hash);

    RAISE NOTICE 'Migração: Adicionado campo openrouter_key_hash em llm_gateway_connections';
  END IF;
END $$;

-- Migração: Adicionar coluna openrouter_key_name (caso tabela já exista sem ela)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'llm_gateway_connections'
    AND column_name = 'openrouter_key_name'
  ) THEN
    ALTER TABLE llm_gateway_connections
    ADD COLUMN openrouter_key_name TEXT;

    RAISE NOTICE 'Migração: Adicionado campo openrouter_key_name em llm_gateway_connections';
  END IF;
END $$;

-- ============================================================================
-- SETUP COMPLETO! ✅
-- ============================================================================

-- Agora configure as variáveis de ambiente:
-- export SUPABASE_URL=https://seu-projeto.supabase.co
-- export SUPABASE_ANON_KEY=sua-anon-key
-- export ENCRYPTION_KEY=<64 hex chars>   (gerar com: openssl rand -hex 32)
-- export OPENROUTER_MANAGEMENT_KEY=<management key do OpenRouter>
--
-- ⚠️  REGRA DE SEGURANÇA:
-- NUNCA criar tools MCP que acessam llm_gateway_connections!
-- Essa tabela é apenas para código interno (API keys criptografadas)
