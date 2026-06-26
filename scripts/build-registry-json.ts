#!/usr/bin/env bun

/**
 * Build the static first-party catalog `registry.json` from every MCP's
 * app.json / deco.json.
 *
 * This flat file is the "first-party" source consumed by Studio's registry
 * catalog (mesh fetches it over HTTPS and caches it). It is the same mapping
 * `publish-one.ts` uses to publish to the live registry, so the committed file
 * stays consistent with what publishing produces.
 *
 * Usage:
 *   bun scripts/build-registry-json.ts            # regenerate registry.json
 *   bun scripts/build-registry-json.ts --check    # fail if registry.json is stale
 *
 * Output: only PUBLIC (listed) items, sorted by id for a stable, churn-free file.
 */

import { readFile, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  type AppJson,
  type RegistryItemData,
  buildRegistryData,
} from "./lib/registry-payload";

const ROOT = join(import.meta.dir, "..");
const OUTPUT_PATH = join(ROOT, "registry.json");

/** Dirs that have an app.json but are not real store entries. */
const SKIP_DIRS = new Set(["template-minimal", "shared", "node_modules"]);

async function readConfig(dir: string): Promise<AppJson | null> {
  const decoJson = join(ROOT, dir, "deco.json");
  const appJson = join(ROOT, dir, "app.json");
  const path = existsSync(decoJson)
    ? decoJson
    : existsSync(appJson)
      ? appJson
      : null;
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as AppJson;
  } catch (err) {
    console.error(`⚠️  Skipping ${dir}: invalid JSON (${err})`);
    return null;
  }
}

async function buildCatalog(): Promise<RegistryItemData[]> {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const dirs = entries
    .filter(
      (e) =>
        e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name),
    )
    .map((e) => e.name)
    .sort();

  const items: RegistryItemData[] = [];
  for (const dir of dirs) {
    const app = await readConfig(dir);
    if (!app?.name || !app?.scopeName) continue;
    const item = buildRegistryData(app);
    // The static catalog is the public store — drop unlisted items.
    if (item.is_public === false) continue;
    items.push(item);
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

function serialize(items: RegistryItemData[]): string {
  return `${JSON.stringify(items, null, 2)}\n`;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const items = await buildCatalog();
  const next = serialize(items);

  if (check) {
    const current = existsSync(OUTPUT_PATH)
      ? await readFile(OUTPUT_PATH, "utf-8")
      : "";
    if (current !== next) {
      console.error(
        "❌ registry.json is out of date. Run `bun run build:registry` and commit the result.",
      );
      process.exit(1);
    }
    console.log(`✅ registry.json is up to date (${items.length} items).`);
    return;
  }

  await writeFile(OUTPUT_PATH, next);
  console.log(`✅ Wrote registry.json with ${items.length} public items.`);
}

main().catch((err) => {
  console.error("❌ Fatal error building registry.json:", err);
  process.exit(1);
});
