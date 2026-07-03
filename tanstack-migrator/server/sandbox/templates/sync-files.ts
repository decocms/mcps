/**
 * Files installed into the -tanstack repo so CMS content edited on the
 * production (Fresh) site keeps flowing in: a scheduled GitHub workflow that
 * fetches /.decofile from production and rewrites .deco/blocks/.
 *
 * Mirrors deco-sites/granadobr-tanstack (.github/workflows/sync-decofile.yml
 * + scripts/sync-decofile.ts). The script is a local shim of
 * @decocms/start/scripts/sync-decofile.ts — replace with the node_modules
 * path once every migrated site is on a release that bundles it.
 */

export const SYNC_WORKFLOW_PATH = ".github/workflows/sync-decofile.yml";
export const SYNC_SCRIPT_PATH = "scripts/sync-decofile.ts";
export const SYNC_PACKAGE_SCRIPT_NAME = "sync:decofile";

export function syncPackageScriptCommand(prodUrl: string): string {
  return `bun ${SYNC_SCRIPT_PATH} --url ${prodUrl}`;
}

export function syncWorkflowYaml(input: { prodUrl: string }): string {
  const host = input.prodUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `name: Sync .deco/blocks from production

# Mirrors blocks edited via the deco admin UI on ${input.prodUrl}
# into this repo's .deco/blocks/ so the TanStack migration sees fresh CMS
# state. Runs every 30 min on schedule and on-demand via workflow_dispatch.
# Installed automatically by the tanstack-migrator MCP.

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Fetch /.decofile and write blocks
        run: bun run ${SYNC_PACKAGE_SCRIPT_NAME}

      - name: Commit & push if changed
        run: |
          git config user.name "deco-sync-bot"
          git config user.email "sync@deco.cx"
          git add .deco/blocks/
          if git diff --staged --quiet; then
            echo "No changes to sync"
            exit 0
          fi
          git commit -m "sync: .deco/blocks from ${host}"
          git push
`;
}

export function syncScriptSource(): string {
  return `#!/usr/bin/env bun
/**
 * Local shim for \`@decocms/start/scripts/sync-decofile.ts\`.
 * Installed by the tanstack-migrator MCP. Behaviour mirrors the upstream
 * script: fetch /.decofile from production and rewrite .deco/blocks/.
 */
import fs from "node:fs";
import path from "node:path";

interface ParsedArgs {
  site?: string;
  url?: string;
  out: string;
  dryRun: boolean;
  clean: boolean;
}

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(\`--\${name}\`);
    if (i === -1 || !argv[i + 1] || argv[i + 1].startsWith("--")) return undefined;
    return argv[i + 1];
  };
  const has = (name: string): boolean => argv.includes(\`--\${name}\`);
  return {
    site: get("site"),
    url: get("url"),
    out: get("out") ?? ".deco/blocks",
    dryRun: has("dry-run"),
    clean: !has("no-clean"),
  };
}

function normalizeKey(rawKey: string): string {
  let k = rawKey;
  while (k.includes("%")) {
    try {
      const next = decodeURIComponent(k);
      if (next === k) break;
      k = next;
    } catch {
      break;
    }
  }
  return k;
}

function encodeBlockKeyToFilename(key: string): string {
  return encodeURIComponent(key) + ".json";
}

function normalizeBlocks(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

async function fetchDecofile(baseUrl: string): Promise<Record<string, unknown>> {
  const url = baseUrl.replace(/\\/$/, "") + "/.decofile";
  console.log(\`Fetching \${url} ...\`);
  const res = await fetch(url, { headers: { "user-agent": "decocms-sync-decofile/1.0" } });
  if (!res.ok) throw new Error(\`GET \${url} returned \${res.status} \${res.statusText}\`);
  const json = (await res.json()) as Record<string, unknown>;
  if (!json || typeof json !== "object") throw new Error(\`Unexpected response shape from \${url}\`);
  return json;
}

function readExistingSnapshot(dir: string): Record<string, unknown> {
  if (!fs.existsSync(dir)) return {};
  const out: Record<string, unknown> = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const key = normalizeKey(f.replace(/\\.json$/, ""));
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      // ignore unparseable
    }
  }
  return out;
}

function diffSnapshots(
  next: Record<string, unknown>,
  prev: Record<string, unknown>,
): { added: string[]; removed: string[]; changed: string[] } {
  const nextKeys = new Set(Object.keys(next));
  const prevKeys = new Set(Object.keys(prev));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of nextKeys) {
    if (!prevKeys.has(k)) added.push(k);
    else if (JSON.stringify(next[k]) !== JSON.stringify(prev[k])) changed.push(k);
  }
  for (const k of prevKeys) if (!nextKeys.has(k)) removed.push(k);
  return { added, removed, changed };
}

function writeAtomically(dir: string, blocks: Record<string, unknown>, clean: boolean): void {
  const stagingDir = \`\${dir}.tmp-\${process.pid}\`;
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  for (const [key, value] of Object.entries(blocks)) {
    fs.writeFileSync(
      path.join(stagingDir, encodeBlockKeyToFilename(key)),
      JSON.stringify(value, null, 2),
    );
  }
  if (clean) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(stagingDir, dir);
  } else {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(stagingDir)) {
      fs.copyFileSync(path.join(stagingDir, f), path.join(dir, f));
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.site && !args.url) {
    console.error("Usage: bun scripts/sync-decofile.ts --site <name>  OR  --url <base-url>");
    process.exit(2);
  }
  const baseUrl = args.url ?? \`https://www.\${args.site}.com.br\`;
  const outDir = path.resolve(process.cwd(), args.out);

  const next = normalizeBlocks(await fetchDecofile(baseUrl));
  const prev = readExistingSnapshot(outDir);
  const diff = diffSnapshots(next, prev);

  console.log("");
  console.log(\`  fetched  \${Object.keys(next).length} blocks\`);
  console.log(\`  on disk  \${Object.keys(prev).length} blocks\`);
  console.log(\`  added    \${diff.added.length}\`);
  console.log(\`  removed  \${diff.removed.length}\`);
  console.log(\`  changed  \${diff.changed.length}\`);
  console.log("");

  if (args.dryRun) {
    console.log("--dry-run set, not writing.");
    return;
  }

  writeAtomically(outDir, next, args.clean);
  console.log(\`Wrote \${Object.keys(next).length} blocks to \${path.relative(process.cwd(), outDir)}\`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
}
