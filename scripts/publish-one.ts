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
 *   MESH_ADMIN_URL  - Override the publish URL (default: https://studio.decocms.com/org/deco/registry/publish-request)
 */

import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";
import {
  type AppJson,
  type RegistryItemData,
  buildRegistryData,
} from "./lib/registry-payload";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublishRequestBody {
  data: RegistryItemData;
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
  "https://studio.decocms.com/org/deco/registry/publish-request";

const PUBLISH_API_KEY = process.env.PUBLISH_API_KEY ?? "";

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
const decoJsonPath = join(mcpPath, "deco.json");
const appJsonPath = join(mcpPath, "app.json");
const configPath = existsSync(decoJsonPath) ? decoJsonPath : appJsonPath;

if (!existsSync(configPath)) {
  console.log(
    `⏭️  ${mcpName}: no deco.json or app.json found, skipping mesh publish`,
  );
  process.exit(0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readAppJson(): Promise<AppJson> {
  const raw = await readFile(configPath, "utf-8");
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
  return {
    data: buildRegistryData(app, { readme }),
    requester: {
      name: app.requester?.name ?? committer.name,
      email: app.requester?.email ?? committer.email,
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (PUBLISH_API_KEY) {
    headers["Authorization"] = `Bearer ${PUBLISH_API_KEY}`;
  }

  const res = await fetch(PUBLISH_URL, {
    method: "POST",
    headers,
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
