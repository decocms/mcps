#!/usr/bin/env bun
/**
 * Make `dist/server` deployable with a direct `wrangler deploy`.
 *
 * The @cloudflare/vite-plugin emits the worker entry as `index.js` (what the
 * generated `dist/server/wrangler.json` declares as `main`), but the shared
 * `@decocms/mcps-shared` vite plugin then renames it `index.js` → `main.js`
 * (the convention `deco deploy` expects) and deletes `index.js.map`. So after a
 * build the entry is `main.js` while `wrangler.json` still points at
 * `index.js` → `wrangler deploy` fails "entry-point index.js not found", and the
 * leftover `//# sourceMappingURL=index.js.map` points at a removed file.
 *
 * This restores `index.js` and disables source-map upload so `wrangler deploy`
 * works with no manual steps. Idempotent. vtex deploys this way (not via
 * `deco deploy`) because its ~6.8MB worker trips the deco deploy backend.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const dist = join(import.meta.dir, "..", "dist", "server");
const mainJs = join(dist, "main.js");
const indexJs = join(dist, "index.js");
const wranglerJson = join(dist, "wrangler.json");

if (!existsSync(mainJs) && !existsSync(indexJs)) {
  console.error(
    "fix-cf-deploy: no entry at dist/server/{main,index}.js — run `bun run build` first",
  );
  process.exit(1);
}

// Restore the entry name wrangler.json expects.
if (existsSync(mainJs) && !existsSync(indexJs)) {
  copyFileSync(mainJs, indexJs);
  console.log("fix-cf-deploy: index.js ← main.js");
}

// Drop the dangling `sourceMappingURL=index.js.map` (that .map was removed).
for (const f of [mainJs, indexJs]) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, "utf8");
  const out = src.replace(
    /\n?\/\/# sourceMappingURL=index\.js\.map\s*$/m,
    "\n",
  );
  if (out !== src) {
    writeFileSync(f, out);
    console.log(
      `fix-cf-deploy: stripped sourceMappingURL from ${f.split("/").pop()}`,
    );
  }
}

// No source maps in a prod worker; stops wrangler validating/uploading them.
if (existsSync(wranglerJson)) {
  const src = readFileSync(wranglerJson, "utf8");
  const out = src.replace(
    /"upload_source_maps":\s*true/,
    '"upload_source_maps":false',
  );
  if (out !== src) {
    writeFileSync(wranglerJson, out);
    console.log("fix-cf-deploy: upload_source_maps=false");
  }
}

console.log("fix-cf-deploy: done");
