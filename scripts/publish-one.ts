#!/usr/bin/env bun

/**
 * Publish a single MCP to the Mesh Admin registry.
 * Used in CI/CD workflows alongside deploy.ts (deco CLI).
 *
 * Usage:
 *   bun scripts/publish-one.ts <mcp-name>
 *   bun scripts/publish-one.ts <mcp-name> --dry-run
 *
 * Environment:
 *   MESH_ADMIN_URL  - Override the publish URL (default: https://mesh-admin.decocms.com/org/deco/registry/publish-request)
 */

import { readFile, stat } from "fs/promises";
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

// ─── Config ──────────────────────────────────────────────────────────────────

const PUBLISH_URL =
  process.env.MESH_ADMIN_URL ??
  "https://mesh-admin.decocms.com/org/deco/registry/publish-request";

const ROOT = join(import.meta.dir, "..");
const args = process.argv.slice(2);
const mcpName = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!mcpName) {
  console.error("❌ MCP name is required");
  console.error("Usage: bun scripts/publish-one.ts <mcp-name> [--dry-run]");
  process.exit(1);
}

const mcpPath = join(ROOT, mcpName);
const appJsonPath = join(mcpPath, "app.json");

if (!existsSync(appJsonPath)) {
  console.log(`⏭️  ${mcpName}: no app.json found, skipping mesh publish`);
  process.exit(0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readAppJson(): Promise<AppJson> {
  const raw = await readFile(appJsonPath, "utf-8");
  return JSON.parse(raw) as AppJson;
}

async function readReadme(): Promise<string | null> {
  const readmePath = join(mcpPath, "README.md");
  try {
    await stat(readmePath);
    const content = await readFile(readmePath, "utf-8");
    if (!content.trim()) return null;
    return content.slice(0, 50_000);
  } catch {
    return null;
  }
}

async function getLastCommitter(): Promise<GitCommitter> {
  try {
    const fmt = "%an|||%ae";
    const result = await $`git log -1 --format=${fmt} -- ${mcpName}/`
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = await readAppJson();
  const readme = await readReadme();
  const committer = await getLastCommitter();
  const payload = buildPayload(app, readme, committer);

  console.log(
    `📦 ${mcpName} → id=${payload.data.id} | requester=${committer.name} <${committer.email}>`,
  );

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("\n⚠️  --dry-run: request não enviado");
    return;
  }

  console.log(`🚀 Publishing to mesh registry...`);

  const res = await fetch(PUBLISH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.text();

  if (res.status >= 200 && res.status < 300) {
    console.log(`✅ Published successfully (${res.status})`);
  } else if (res.status === 409) {
    console.log(
      `✅ Already registered in mesh registry (${res.status}), skipping`,
    );
  } else {
    console.error(`❌ Publish failed (${res.status}): ${body}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`❌ Fatal error publishing ${mcpName}:`, err);
  process.exit(1);
});
