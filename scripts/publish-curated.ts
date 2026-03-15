#!/usr/bin/env bun

/**
 * Bulk publish script for a curated subset of MCPs in the monorepo.
 *
 * Reads a curated set of MCP app.json files, resolves the last committer via
 * git log, and sends a publish-request to the Mesh Admin API.
 *
 * Usage:
 *   bun scripts/publish-curated.ts                     # publish curated MCPs
 *   bun scripts/publish-curated.ts --dry-run           # preview payloads without sending
 *   bun scripts/publish-curated.ts --filter google     # publish only curated MCPs matching filter
 *   bun scripts/publish-curated.ts --delay 5000        # 5s delay between requests (default 2000)
 *   bun scripts/publish-curated.ts --max-retries 5     # max retries on 429 (default 3)
 *   bun scripts/publish-curated.ts --resume            # skip MCPs that already succeeded
 *   bun scripts/publish-curated.ts --reset             # clear progress file and start fresh
 *   bun scripts/publish-curated.ts --url <url>         # custom publish URL (or set MESH_ADMIN_URL env var)
 *
 * Environment:
 *   MESH_ADMIN_URL    - Override the publish URL
 *   PUBLISH_API_KEY   - API key for authentication (sent as Bearer token)
 */

import { readdir, readFile, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";

interface AppJson {
  scopeName: string;
  name: string;
  friendlyName?: string;
  description?: string;
  icon?: string;
  unlisted?: boolean;
  official?: boolean;
  connection?: {
    type?: string;
    url?: string;
    configSchema?: Record<string, unknown>;
  };
  bindings?: Record<string, string>;
  metadata?: {
    categories?: string[];
    official?: boolean;
    tags?: string[];
    short_description?: string;
    mesh_description?: string;
    mesh_unlisted?: boolean;
  };
  tools?: Array<{ name: string; description?: string }>;
}

interface MeshTool {
  name: string;
  description?: string | null;
}

interface PublishRequestBody {
  data: {
    id: string;
    title: string;
    description?: string | null;
    is_public?: boolean;
    _meta?: {
      "mcp.mesh"?: {
        verified?: boolean;
        tags?: string[];
        categories?: string[];
        friendly_name?: string | null;
        short_description?: string | null;
        owner?: string | null;
        readme?: string | null;
        has_remote?: boolean;
        has_oauth?: boolean;
        tools?: MeshTool[];
      };
    };
    server: {
      name: string;
      title?: string;
      description?: string;
      websiteUrl?: string;
      icons?: Array<{ src: string }>;
      remotes?: Array<{
        type?: string;
        url?: string;
        name?: string;
        title?: string;
        description?: string;
      }>;
    };
  };
  requester?: {
    name?: string;
    email?: string;
  };
}

interface GitCommitter {
  name: string;
  email: string;
}

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const resumeMode = args.includes("--resume");
const resetProgress = args.includes("--reset");
const filterValue = getArg("--filter", "");
const delayMs = Number(getArg("--delay", "2000"));
const maxRetries = Number(getArg("--max-retries", "3"));

const PUBLISH_URL =
  getArg("--url", "") ||
  process.env.MESH_ADMIN_URL ||
  "https://studio.decocms.com/org/deco/registry/publish-request";

const PUBLISH_API_KEY = process.env.PUBLISH_API_KEY ?? "";

const CURATED_MCP_FOLDERS = [
  "airtable",
  "apify",
  "clickhouse",
  "content-scraper",
  "grain",
  "google-calendar",
  "google-docs",
  "google-drive",
  "google-gmail",
  "google-sheets",
  "perplexity",
  "slack-mcp",
  "stripe-official",
  "supabase-official",
  "vtex",
] as const;

const CURATED_MCP_SET = new Set<string>(CURATED_MCP_FOLDERS);

const ROOT = join(import.meta.dir, "..");
const PROGRESS_FILE = join(ROOT, ".publish-curated-progress.json");

async function loadProgress(): Promise<Set<string>> {
  if (resetProgress) return new Set();
  try {
    if (!existsSync(PROGRESS_FILE)) return new Set();
    const raw = await readFile(PROGRESS_FILE, "utf-8");
    const data = JSON.parse(raw) as { published?: string[] };
    return new Set(data.published ?? []);
  } catch {
    return new Set();
  }
}

async function saveProgress(published: Set<string>): Promise<void> {
  await writeFile(
    PROGRESS_FILE,
    JSON.stringify(
      { published: [...published], updatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}

async function findCuratedMcpFolders(): Promise<string[]> {
  const entries = await readdir(ROOT);
  const folders: string[] = [];

  for (const entry of entries) {
    if (!CURATED_MCP_SET.has(entry)) continue;

    const fullPath = join(ROOT, entry);
    const folderStat = await stat(fullPath);
    if (!folderStat.isDirectory()) continue;

    const appJsonPath = join(fullPath, "app.json");
    try {
      await stat(appJsonPath);
      folders.push(entry);
    } catch {
      // curated entry exists but is not publishable yet
    }
  }

  return folders.sort();
}

async function readAppJson(mcpFolder: string): Promise<AppJson> {
  const raw = await readFile(join(ROOT, mcpFolder, "app.json"), "utf-8");
  return JSON.parse(raw) as AppJson;
}

async function getLastCommitter(mcpFolder: string): Promise<GitCommitter> {
  try {
    const fmt = "%an|||%ae";
    const result = await $`git log -1 --format=${fmt} -- ${mcpFolder}/`
      .cwd(ROOT)
      .quiet();
    const output = result.stdout.toString().trim();
    const [name, email] = output.split("|||");
    if (name && email) return { name, email };
  } catch {
    // fallback below
  }
  return { name: "deco", email: "eng@deco.cx" };
}

async function readReadme(mcpFolder: string): Promise<string | null> {
  const readmePath = join(ROOT, mcpFolder, "README.md");
  try {
    const content = await readFile(readmePath, "utf-8");
    if (!content.trim()) return null;
    return content.slice(0, 50_000);
  } catch {
    return null;
  }
}

function buildPayload(
  app: AppJson,
  readme: string | null,
  committer: GitCommitter,
): PublishRequestBody {
  const id = `${app.scopeName}/${app.name}`;
  const title = app.friendlyName ?? app.name;
  const isOfficial = app.metadata?.official ?? app.official ?? false;
  const hasRemote =
    app.connection?.type !== "BINDING" && Boolean(app.connection?.url);
  const hasOAuth = Boolean(app.connection?.configSchema);

  const tools: MeshTool[] | undefined = app.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description ?? null,
  }));

  const meshMeta: NonNullable<
    NonNullable<PublishRequestBody["data"]["_meta"]>["mcp.mesh"]
  > = {
    verified: isOfficial,
    friendly_name: app.friendlyName ?? null,
    short_description: app.metadata?.short_description?.slice(0, 160) ?? null,
    owner: app.scopeName,
    has_remote: hasRemote,
    has_oauth: hasOAuth,
  };

  if (app.metadata?.tags?.length) meshMeta.tags = app.metadata.tags;
  if (app.metadata?.categories?.length) {
    meshMeta.categories = [app.metadata.categories[0]];
  }
  if (readme) {
    meshMeta.readme = readme;
  } else if (app.metadata?.mesh_description) {
    meshMeta.readme = app.metadata.mesh_description;
  }
  if (tools?.length) meshMeta.tools = tools;

  const remotes: PublishRequestBody["data"]["server"]["remotes"] = [];
  if (hasRemote && app.connection?.url) {
    remotes.push({
      type: app.connection.type ?? "HTTP",
      url: app.connection.url,
      name: app.name,
      title,
      description: app.description,
    });
  }

  return {
    data: {
      id,
      title,
      description: app.description ?? null,
      is_public: !(app.unlisted ?? app.metadata?.mesh_unlisted ?? false),
      _meta: { "mcp.mesh": meshMeta },
      server: {
        name: app.name,
        title,
        description: app.description,
        ...(app.icon ? { icons: [{ src: app.icon }] } : {}),
        ...(remotes.length ? { remotes } : {}),
      },
    },
    requester: {
      name: committer.name,
      email: committer.email,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m${remainingSeconds}s`
    : `${minutes}m`;
}

async function publishWithRetry(
  folder: string,
  payload: PublishRequestBody,
  retries: number,
): Promise<{ folder: string; status: number; body: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (PUBLISH_API_KEY) {
        headers["Authorization"] = `Bearer ${PUBLISH_API_KEY}`;
      }
      response = await fetch(PUBLISH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === retries) {
        return { folder, status: 0, body: `Network error: ${message}` };
      }
      console.log(
        `  ⚠️  ${folder}: network error (${message}), retrying in 10s (${attempt + 1}/${retries})...`,
      );
      await sleep(10_000);
      continue;
    }

    const body = await response.text();

    if (response.status !== 429) {
      return { folder, status: response.status, body };
    }

    if (attempt === retries) {
      return { folder, status: response.status, body };
    }

    const waitSeconds = 60;

    console.log(
      `  ⏳ ${folder}: rate limited (429), aguardando ${formatWait(waitSeconds)} (tentativa ${attempt + 1}/${retries})...`,
    );
    await sleep(waitSeconds * 1000);
  }

  return { folder, status: 429, body: "max retries exceeded" };
}

async function main(): Promise<void> {
  console.log("🔍 Buscando MCPs curados com app.json...\n");
  console.log(`📚 Curated set: ${CURATED_MCP_FOLDERS.join(", ")}\n`);

  let folders = await findCuratedMcpFolders();

  const missingFolders = CURATED_MCP_FOLDERS.filter(
    (folder) => !folders.includes(folder),
  );
  if (missingFolders.length > 0) {
    console.log(
      `⚠️  Ignorando ${missingFolders.length} entradas curadas ausentes: ${missingFolders.join(", ")}\n`,
    );
  }

  if (filterValue) {
    folders = folders.filter((folder) => folder.includes(filterValue));
    console.log(
      `📋 Filtro aplicado: "${filterValue}" → ${folders.length} MCPs\n`,
    );
  }

  if (folders.length === 0) {
    console.log("Nenhum MCP curado encontrado.");
    return;
  }

  const published = await loadProgress();

  if (resumeMode && published.size > 0) {
    const before = folders.length;
    folders = folders.filter((folder) => !published.has(folder));
    console.log(
      `📋 Modo --resume: ${before - folders.length} já publicados, ${folders.length} restantes\n`,
    );
  }

  if (resetProgress && existsSync(PROGRESS_FILE)) {
    await writeFile(PROGRESS_FILE, "{}");
    console.log("🗑️  Progresso anterior removido\n");
  }

  console.log(`📦 ${folders.length} MCPs curados para processar`);
  console.log(`🌐 URL: ${PUBLISH_URL}\n`);

  if (dryRun) {
    console.log("⚠️  Modo --dry-run: nenhum request será enviado\n");
  }

  const payloads: Array<{ folder: string; payload: PublishRequestBody }> = [];

  for (const folder of folders) {
    try {
      const app = await readAppJson(folder);
      const committer = await getLastCommitter(folder);
      const readme = await readReadme(folder);
      const payload = buildPayload(app, readme, committer);
      payloads.push({ folder, payload });

      const icon = dryRun ? "📝" : "✅";
      console.log(
        `${icon} ${folder} → id=${payload.data.id} | requester=${committer.name} <${committer.email}>`,
      );

      if (dryRun) {
        console.log(JSON.stringify(payload, null, 2));
        console.log("---");
      }
    } catch (error) {
      console.error(`❌ ${folder}: falha ao ler app.json →`, error);
    }
  }

  if (dryRun) {
    console.log(
      `\n📊 Resumo: ${payloads.length}/${folders.length} payloads gerados (dry-run)`,
    );
    return;
  }

  console.log(
    `\n🚀 Enviando ${payloads.length} requests (delay=${delayMs}ms, max-retries=${maxRetries})...\n`,
  );

  let success = 0;
  let failed = 0;
  let rateLimited = 0;

  for (let index = 0; index < payloads.length; index++) {
    const { folder, payload } = payloads[index];

    const result = await publishWithRetry(folder, payload, maxRetries);

    if (result.status >= 200 && result.status < 300) {
      console.log(
        `  ✅ [${index + 1}/${payloads.length}] ${result.folder} → ${result.status}`,
      );
      published.add(folder);
      await saveProgress(published);
      success++;
    } else if (result.status === 429) {
      console.error(
        `  ⏸️  [${index + 1}/${payloads.length}] ${result.folder} → 429 (rate limited após ${maxRetries} retries)`,
      );
      rateLimited++;
      failed++;
    } else {
      console.error(
        `  ❌ [${index + 1}/${payloads.length}] ${result.folder} → ${result.status}: ${result.body}`,
      );
      failed++;
    }

    if (index < payloads.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(
    `\n📊 Resultado: ${success} sucesso, ${failed} falha(s)${rateLimited > 0 ? ` (${rateLimited} rate limited)` : ""}`,
  );

  if (failed > 0) {
    if (rateLimited > 0) {
      console.log(
        "\n💡 Dica: rode novamente com --resume para continuar de onde parou",
      );
    }
    process.exit(1);
  }

  if (existsSync(PROGRESS_FILE)) {
    const { unlink } = await import("fs/promises");
    await unlink(PROGRESS_FILE);
    console.log("🗑️  Arquivo de progresso removido");
  }
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
