#!/usr/bin/env bun
/**
 * Script para popular o Supabase com TODOS os MCPs do Registry
 *
 * Funcionalidades:
 * 1. Cria a tabela mcp_servers se não existir
 * 2. Busca todos os servidores da API do Registry
 * 3. Computa flags (has_remote, is_npm, is_local_repo)
 * 4. Define unlisted baseado na allowlist (allowlist = visible, resto = hidden)
 * 5. Migra dados de verified.ts
 * 6. Upsert no Supabase
 *
 * Usage:
 *   bun run scripts/populate-supabase.ts
 *
 * Environment variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (for write access)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  VERIFIED_SERVERS,
  VERIFIED_SERVER_OVERRIDES,
} from "../server/lib/verified.ts";

// ═══════════════════════════════════════════════════════════════
// SQL para criar a tabela
// ═══════════════════════════════════════════════════════════════

const CREATE_TABLE_SQL = `
-- Tabela principal (chave primária composta para suportar múltiplas versões)
CREATE TABLE IF NOT EXISTS mcp_servers (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (name, version),
  schema_url TEXT,
  description TEXT,
  website_url TEXT,
  repository JSONB,
  remotes JSONB,
  packages JSONB,
  icons JSONB,
  registry_status TEXT DEFAULT 'active',
  published_at TIMESTAMPTZ,
  registry_updated_at TIMESTAMPTZ,
  is_latest BOOLEAN DEFAULT TRUE,
  friendly_name TEXT,
  short_description TEXT,
  mesh_description TEXT,
  tags TEXT[],
  categories TEXT[],
  verified BOOLEAN DEFAULT FALSE,
  unlisted BOOLEAN DEFAULT TRUE,
  has_oauth BOOLEAN DEFAULT FALSE,
  has_remote BOOLEAN DEFAULT FALSE,
  is_npm BOOLEAN DEFAULT FALSE,
  is_local_repo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mcp_servers_is_latest ON mcp_servers(is_latest);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_verified ON mcp_servers(verified);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_unlisted ON mcp_servers(unlisted);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_has_remote ON mcp_servers(has_remote);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_listing ON mcp_servers(is_latest, unlisted, verified DESC, name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tags ON mcp_servers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_categories ON mcp_servers USING GIN(categories);

-- Trigger para updated_at
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
`;

const ENABLE_RLS_SQL = `
-- Enable RLS
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Allow public read access" ON mcp_servers;
CREATE POLICY "Allow public read access" ON mcp_servers
    FOR SELECT USING (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role full access" ON mcp_servers;
CREATE POLICY "Allow service role full access" ON mcp_servers
    FOR ALL USING (auth.role() = 'service_role');
`;

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
const REQUEST_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════
// Database Setup
// ═══════════════════════════════════════════════════════════════

async function ensureTableExists(supabase: SupabaseClient): Promise<void> {
  console.log("🗄️  Verificando/criando tabela mcp_servers...\n");

  // Executa o SQL para criar tabela (IF NOT EXISTS garante idempotência)
  const { error: createError } = await supabase.rpc("exec_sql", {
    sql: CREATE_TABLE_SQL,
  });

  // Se o RPC não existir, tenta via query direta (menos seguro, mas funcional)
  if (
    createError?.message?.includes("function") ||
    createError?.code === "42883"
  ) {
    console.log(
      "   ⚠️  RPC exec_sql não disponível, tentando criar tabela via select...",
    );

    // Verifica se a tabela existe tentando uma query
    const { error: checkError } = await supabase
      .from("mcp_servers")
      .select("name")
      .limit(1);

    if (checkError?.code === "42P01") {
      // Tabela não existe - precisa criar manualmente
      console.error("\n❌ Tabela mcp_servers não existe!");
      console.error("   Execute o SQL em: registry/scripts/create-table.sql");
      console.error("   No Supabase Dashboard → SQL Editor\n");
      process.exit(1);
    } else if (checkError) {
      throw new Error(`Erro ao verificar tabela: ${checkError.message}`);
    } else {
      console.log("   ✅ Tabela mcp_servers já existe\n");
    }
  } else if (createError) {
    throw new Error(`Erro ao criar tabela: ${createError.message}`);
  } else {
    console.log("   ✅ Tabela mcp_servers pronta\n");

    // Tenta habilitar RLS (pode falhar se já estiver habilitado)
    await supabase.rpc("exec_sql", { sql: ENABLE_RLS_SQL }).catch(() => {
      // Ignora erros de RLS - provavelmente já está configurado
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface RegistryServer {
  server: {
    $schema?: string;
    name: string;
    description?: string;
    version: string;
    repository?: { url: string; source?: string; subfolder?: string };
    remotes?: Array<{ type: string; url: string }>;
    packages?: Array<{ type: string; name: string; version?: string }>;
    icons?: Array<{ src: string; mimeType?: string; theme?: string }>;
    websiteUrl?: string;
  };
  _meta: {
    "io.modelcontextprotocol.registry/official"?: {
      status: string;
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
    [key: string]: unknown;
  };
}

interface RegistryResponse {
  servers: RegistryServer[];
  metadata: {
    nextCursor?: string;
    count: number;
  };
}

interface McpServerRow {
  name: string;
  version: string;
  schema_url: string | null;
  description: string | null;
  website_url: string | null;
  repository: { url: string; source?: string; subfolder?: string } | null;
  remotes: Array<{ type: string; url: string }> | null;
  packages: Array<{ type: string; name: string; version?: string }> | null;
  icons: Array<{ src: string; mimeType?: string; theme?: string }> | null;
  registry_status: string;
  published_at: string | null;
  registry_updated_at: string | null;
  is_latest: boolean;
  friendly_name: string | null;
  short_description: string | null;
  mesh_description: string | null;
  tags: string[] | null;
  categories: string[] | null;
  verified: boolean;
  unlisted: boolean;
  has_oauth: boolean;
  has_remote: boolean;
  is_npm: boolean;
  is_local_repo: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Busca todos os nomes de servidores (apenas latest para obter a lista)
 */
async function fetchAllServerNames(): Promise<string[]> {
  const serverNames: string[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  console.log("🔍 Fetching server names from MCP Registry...\n");

  do {
    const url = new URL(REGISTRY_URL);
    url.searchParams.set("limit", "100");
    url.searchParams.set("version", "latest");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Registry API returned status ${response.status}`);
      }

      const data: RegistryResponse = await response.json();
      const names = data.servers.map((s) => s.server.name);
      serverNames.push(...names);
      cursor = data.metadata.nextCursor;
      pageCount++;

      console.log(
        `   Page ${pageCount}: +${data.servers.length} servers (total names: ${serverNames.length})`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } while (cursor);

  console.log(`\n✅ Total server names: ${serverNames.length}`);
  return serverNames;
}

/**
 * Busca todas as versões de um servidor com retry para 429
 */
async function fetchServerVersions(
  name: string,
  retries = 3,
): Promise<RegistryServer[]> {
  const baseUrl = REGISTRY_URL.replace("/servers", "");
  const url = `${baseUrl}/servers/${encodeURIComponent(name)}/versions`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (response.status === 404) {
        clearTimeout(timeoutId);
        return [];
      }

      if (response.status === 429) {
        clearTimeout(timeoutId);
        // Rate limited - wait exponentially before retry
        if (attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
          console.log(
            `   ⏳ Rate limited on ${name}, waiting ${waitTime}ms (attempt ${attempt + 1}/${retries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error("Rate limit exceeded");
      }

      if (!response.ok) {
        clearTimeout(timeoutId);
        throw new Error(
          `Registry API returned status ${response.status}: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        servers: RegistryServer[];
        metadata: { count: number };
      };
      clearTimeout(timeoutId);
      return data.servers;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Timeout fetching versions for ${name}`);
        }
        if (attempt === retries) {
          throw new Error(
            `Error fetching versions for ${name}: ${error.message}`,
          );
        }
      }
    }
  }

  return [];
}

/**
 * Busca servidores que precisam ser atualizados (não estão no banco)
 */
async function getServersToUpdate(
  supabase: SupabaseClient,
  allServerNames: string[],
  forceUpdate = false,
): Promise<string[]> {
  // Se forceUpdate = true, retornar todos
  if (forceUpdate) {
    console.log("   🔄 Force update enabled - will update all servers");
    return allServerNames;
  }

  // Buscar nomes únicos já no banco
  const { data: existingServers } = await supabase
    .from("mcp_servers")
    .select("name")
    .eq("is_latest", true);

  const existingNames = new Set(
    (existingServers || []).map((s: { name: string }) => s.name),
  );

  // Retornar apenas os que faltam
  return allServerNames.filter((name) => !existingNames.has(name));
}

/**
 * Busca todas as versões de todos os servidores (com controle de concorrência e retry)
 */
async function fetchAllServersWithVersions(
  supabase: SupabaseClient,
  resumeFrom?: number,
  forceUpdate = false,
): Promise<RegistryServer[]> {
  // 1. Buscar lista de nomes
  const allServerNames = await fetchAllServerNames();

  // 2. Identificar quais precisam ser atualizados
  console.log("\n🔍 Checking which servers need to be fetched...");
  const serversToFetch = await getServersToUpdate(
    supabase,
    allServerNames,
    forceUpdate,
  );

  if (serversToFetch.length === 0) {
    console.log("✅ All servers are up to date!\n");
    return [];
  }

  console.log(
    `📦 Need to fetch ${serversToFetch.length} servers (${allServerNames.length - serversToFetch.length} already in DB)\n`,
  );

  // 3. Buscar versões com concorrência reduzida e retry
  const CONCURRENT_REQUESTS = 3; // Reduzido para evitar 429
  const BATCH_DELAY = 1000; // 1s entre batches
  const allServers: RegistryServer[] = [];
  const startFrom = resumeFrom || 0;

  console.log(
    `📦 Fetching versions starting from server ${startFrom}/${serversToFetch.length}...\n`,
  );

  for (let i = startFrom; i < serversToFetch.length; i += CONCURRENT_REQUESTS) {
    const batch = serversToFetch.slice(i, i + CONCURRENT_REQUESTS);
    const promises = batch.map(async (name) => {
      try {
        const versions = await fetchServerVersions(name);
        return { name, versions, success: true };
      } catch (error) {
        console.error(`   ❌ Failed to fetch ${name}: ${error}`);
        return { name, versions: [], success: false };
      }
    });

    const results = await Promise.all(promises);

    // Coletar versões bem-sucedidas
    const successfulResults = results.filter((r) => r.success);
    const batchServers = successfulResults.flatMap((r) => r.versions);
    allServers.push(...batchServers);

    const processed = i + batch.length;
    console.log(
      `   Processed ${processed}/${serversToFetch.length} servers (${allServers.length} total versions)`,
    );

    // Delay entre batches para evitar rate limiting
    if (i + CONCURRENT_REQUESTS < serversToFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  console.log(`\n✅ Total server versions fetched: ${allServers.length}`);
  return allServers;
}

function transformServerToRow(
  server: RegistryServer,
  verifiedSet: Set<string>,
): McpServerRow {
  const officialMeta =
    server._meta["io.modelcontextprotocol.registry/official"];
  const name = server.server.name;

  // Get icon override if exists
  const override = VERIFIED_SERVER_OVERRIDES[name];
  const icons = server.server.icons ?? override?.icons ?? null;
  const repository = server.server.repository ?? override?.repository ?? null;

  // Compute flags
  const hasRemote = (server.server.remotes?.length ?? 0) > 0;
  const isNpm = server.server.packages?.some((p) => p.type === "npm") ?? false;
  const isLocalRepo = !hasRemote && !isNpm && !!server.server.repository;

  // All new servers are unlisted by default (must be manually approved)
  const unlisted = true;

  return {
    // Registry data
    name,
    version: server.server.version,
    schema_url: server.server.$schema ?? null,
    description: server.server.description ?? null, // Descrição original da API
    website_url: server.server.websiteUrl ?? null,
    repository,
    remotes: server.server.remotes ?? null,
    packages: server.server.packages ?? null,
    icons,
    registry_status: officialMeta?.status ?? "active",
    published_at: officialMeta?.publishedAt ?? null,
    registry_updated_at: officialMeta?.updatedAt ?? null,
    is_latest: officialMeta?.isLatest ?? true,

    // Mesh data
    verified: verifiedSet.has(name),
    unlisted,
    has_oauth: false,

    // Computed flags
    has_remote: hasRemote,
    is_npm: isNpm,
    is_local_repo: isLocalRepo,

    // Duplicar description em short_description (para consistência)
    short_description: server.server.description ?? null,

    // To be filled later (manually or AI)
    friendly_name: null,
    mesh_description: null,
    tags: null,
    categories: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("           MCP Registry → Supabase Sync");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables:");
    if (!supabaseUrl) console.error("   - SUPABASE_URL");
    if (!supabaseKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    console.error("\nSet these in your .env file or environment.");
    process.exit(1);
  }

  // Create Supabase client with service role key (for write access)
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for FORCE_UPDATE flag
  const forceUpdate = process.env.FORCE_UPDATE === "true";
  if (forceUpdate) {
    console.log("⚠️  FORCE_UPDATE=true - Will update ALL servers\n");
  }

  try {
    // 0. Ensure table exists
    await ensureTableExists(supabase);

    // 1. Fetch all server versions from Registry API (only missing ones, or all if force)
    const allServers = await fetchAllServersWithVersions(
      supabase,
      undefined,
      forceUpdate,
    );

    // Se não há nada novo, finalizar
    if (allServers.length === 0) {
      console.log("✅ Nenhum servidor novo para adicionar!");
      return;
    }

    // 2. Load verified servers data
    const verifiedSet = new Set(VERIFIED_SERVERS);

    console.log(`\n📋 Static data loaded:`);
    console.log(`   Verified servers: ${verifiedSet.size}`);

    // 3. Transform servers to rows
    console.log("\n🔄 Transforming servers...");
    const rows = allServers.map((server) =>
      transformServerToRow(server, verifiedSet),
    );

    // 4. Upsert to Supabase in batches
    console.log("\n📤 Upserting to Supabase...");
    const BATCH_SIZE = 500;
    let upsertedCount = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("mcp_servers")
        .upsert(batch, { onConflict: "name,version" });

      if (error) {
        throw new Error(`Upsert error: ${error.message}`);
      }

      upsertedCount += batch.length;
      console.log(`   Upserted ${upsertedCount}/${rows.length} servers`);
    }

    // 5. Print stats
    console.log(
      "\n═══════════════════════════════════════════════════════════",
    );
    console.log("                        DONE!");
    console.log(
      "═══════════════════════════════════════════════════════════\n",
    );

    console.log("📊 Summary:");
    console.log(`   Total servers: ${rows.length}`);
    console.log(`   Verified: ${rows.filter((r) => r.verified).length}`);
    console.log(
      `   Visible (allowlist): ${rows.filter((r) => !r.unlisted).length}`,
    );
    console.log(
      `   Hidden (unlisted): ${rows.filter((r) => r.unlisted).length}`,
    );
    console.log(`   With remote: ${rows.filter((r) => r.has_remote).length}`);
    console.log(`   With NPM: ${rows.filter((r) => r.is_npm).length}`);
    console.log(
      `   Local repo only: ${rows.filter((r) => r.is_local_repo).length}`,
    );
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
