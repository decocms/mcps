#!/usr/bin/env bun

/**
 * Bulk publish script for all MCPs in the monorepo.
 *
 * Reads each MCP's app.json, resolves the last committer via git log,
 * and sends a publish-request to the Mesh Admin API.
 *
 * Usage:
 *   bun scripts/publish-all.ts                     # publish all MCPs (sequential, 2s delay)
 *   bun scripts/publish-all.ts --dry-run           # preview payloads without sending
 *   bun scripts/publish-all.ts --filter vtex       # publish only matching MCPs
 *   bun scripts/publish-all.ts --delay 5000        # 5s delay between requests (default 2000)
 *   bun scripts/publish-all.ts --max-retries 5     # max retries on 429 (default 3)
 *   bun scripts/publish-all.ts --resume            # skip MCPs that already succeeded (reads progress file)
 *   bun scripts/publish-all.ts --reset             # clear progress file and start fresh
 */

import { readdir, readFile, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── CLI Args ────────────────────────────────────────────────────────────────

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
  "http://localhost:3000/org/asdasd-capoeira-labs/registry/publish-request";

const SKIP_FOLDERS = new Set([
  "node_modules",
  "dist",
  "shared",
  "shared-v2",
  "scripts",
  "docs",
  ".github",
  ".cursor",
  ".claude-plugin",
  "template-minimal",
]);

const ROOT = join(import.meta.dir, "..");
const PROGRESS_FILE = join(ROOT, ".publish-progress.json");

// ─── Progress tracking ──────────────────────────────────────────────────────

async function loadProgress(): Promise<Set<string>> {
  if (resetProgress) return new Set();
  try {
    if (!existsSync(PROGRESS_FILE)) return new Set();
    const raw = await readFile(PROGRESS_FILE, "utf-8");
    const data = JSON.parse(raw) as { published: string[] };
    return new Set(data.published);
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findMcpFolders(): Promise<string[]> {
  const entries = await readdir(ROOT);
  const folders: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || SKIP_FOLDERS.has(entry)) continue;

    const fullPath = join(ROOT, entry);
    const s = await stat(fullPath);
    if (!s.isDirectory()) continue;

    const appJsonPath = join(fullPath, "app.json");
    try {
      await stat(appJsonPath);
      folders.push(entry);
    } catch {
      // no app.json — skip
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

  const tools: MeshTool[] | undefined = app.tools?.map((t) => ({
    name: t.name,
    description: t.description ?? null,
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
  if (app.metadata?.categories?.length)
    meshMeta.categories = [app.metadata.categories[0]];
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
      is_public: !(app.unlisted ?? false),
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
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

async function publishWithRetry(
  folder: string,
  payload: PublishRequestBody,
  retries: number,
): Promise<{ folder: string; status: number; body: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(PUBLISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.text();

    if (res.status !== 429) {
      return { folder, status: res.status, body };
    }

    if (attempt === retries) {
      return { folder, status: res.status, body };
    }

    const waitSeconds = 60;

    console.log(
      `  ⏳ ${folder}: rate limited (429), aguardando ${formatWait(waitSeconds)} (tentativa ${attempt + 1}/${retries})...`,
    );
    await sleep(waitSeconds * 1000);
  }

  return { folder, status: 429, body: "max retries exceeded" };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🔍 Buscando MCPs com app.json...\n");

  let folders = await findMcpFolders();

  if (filterValue) {
    folders = folders.filter((f) => f.includes(filterValue));
    console.log(
      `📋 Filtro aplicado: "${filterValue}" → ${folders.length} MCPs\n`,
    );
  }

  if (folders.length === 0) {
    console.log("Nenhum MCP encontrado.");
    return;
  }

  const published = await loadProgress();

  if (resumeMode && published.size > 0) {
    const before = folders.length;
    folders = folders.filter((f) => !published.has(f));
    console.log(
      `📋 Modo --resume: ${before - folders.length} já publicados, ${folders.length} restantes\n`,
    );
  }

  if (resetProgress && existsSync(PROGRESS_FILE)) {
    await writeFile(PROGRESS_FILE, "{}");
    console.log("🗑️  Progresso anterior removido\n");
  }

  console.log(`📦 ${folders.length} MCPs para processar\n`);

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
    } catch (err) {
      console.error(`❌ ${folder}: falha ao ler app.json →`, err);
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

  for (let i = 0; i < payloads.length; i++) {
    const { folder, payload } = payloads[i];

    const result = await publishWithRetry(folder, payload, maxRetries);

    if (result.status >= 200 && result.status < 300) {
      console.log(
        `  ✅ [${i + 1}/${payloads.length}] ${result.folder} → ${result.status}`,
      );
      published.add(folder);
      await saveProgress(published);
      success++;
    } else if (result.status === 429) {
      console.error(
        `  ⏸️  [${i + 1}/${payloads.length}] ${result.folder} → 429 (rate limited após ${maxRetries} retries)`,
      );
      rateLimited++;
      failed++;
    } else {
      console.error(
        `  ❌ [${i + 1}/${payloads.length}] ${result.folder} → ${result.status}: ${result.body}`,
      );
      failed++;
    }

    if (i < payloads.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(
    `\n📊 Resultado: ${success} sucesso, ${failed} falha(s)${rateLimited > 0 ? ` (${rateLimited} rate limited)` : ""}`,
  );

  if (failed > 0) {
    if (rateLimited > 0) {
      console.log(
        `\n💡 Dica: rode novamente com --resume para continuar de onde parou`,
      );
    }
    process.exit(1);
  }

  // All succeeded — clean up progress file
  if (existsSync(PROGRESS_FILE)) {
    const { unlink } = await import("fs/promises");
    await unlink(PROGRESS_FILE);
    console.log("🗑️  Arquivo de progresso removido");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
