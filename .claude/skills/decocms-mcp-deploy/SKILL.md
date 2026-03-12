---
name: decocms-mcp-deploy
description: Understand and manage CI/CD for the decocms/mcps monorepo. Covers deploy.yml (Cloudflare Workers), publish-registry.yml (registry publish), checks.yml, and publish-jsr.yml. Explains the two deploy platforms and how detection works.
---

# MCP Deploy Pipeline — decocms/mcps

## When to Use This Skill

- Understanding why a deploy/publish did not trigger
- Adding a new MCP to the CI/CD pipeline
- Debugging workflow failures
- Figuring out which workflow handles which MCP type

---

## Two Deployment Platforms

### kubernetes-bun (HTTP custom servers)

MCPs hosted on Deco infrastructure. Deployed by **publishing to the registry** — the platform auto-redeploys when registry is updated.

**Workflow**: `publish-registry.yml` → `scripts/publish-one.ts` → HTTP POST to `studio.decocms.com`

### cloudflare-workers (CF Worker MCPs)

MCPs hosted on Cloudflare Workers. Deployed via **deco CLI** (`deco deploy`).

**Workflow**: `deploy.yml` → `scripts/deploy.ts` → `deco deploy ./dist/server`

### Official external servers (app.json only)

MCPs pointing to external servers (Cloudflare official, Grain, Apify, etc.). No server deployment needed — only registry metadata published.

**Workflow**: `publish-registry.yml` only

---

## Workflow Summary

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `checks.yml` | push/PR | fmt, lint, typecheck changed MCPs |
| `publish-registry.yml` | push to main, manual | Publish app.json MCPs to Mesh registry |
| `deploy.yml` | push to main, manual | Build + `deco deploy` for CF Worker MCPs |
| `publish-jsr.yml` | push to main (shared/ or openrouter/) | Publish packages to JSR |

No `deploy-preview.yml` — preview deploys on PRs were removed.

---

## Detection Logic

### `detect-changed-mcps.ts`

Detects which MCPs have changed based on:
1. MCPs in `deploy.json` with `watch` patterns matching changed files
2. Registry-only MCPs (have `app.json` but NOT in `deploy.json`) — detected if any file in their dir changed

### `deploy.json` — controls what gets deployed

```json
{
  "mcp-name": {
    "site": "site-name",
    "entrypoint": "./dist/server/main.js",
    "platformName": "kubernetes-bun",
    "watch": ["mcp-name/**", "shared/**"]
  }
}
```

- **kubernetes-bun**: entry exists for detection, but `deploy.ts` exits early (publish-registry handles deploy)
- **cloudflare-workers**: entry triggers `deco deploy` via `deploy.ts`

---

## `deploy.ts` Logic

```
if wrangler.toml exists → CF Worker → build + deco deploy
else                    → kubernetes-bun → exit 0 (publish-registry handles it)
```

---

## CF Worker MCPs (platformName: cloudflare-workers)

sora, gemini-pro-vision, pinecone, reddit, replicate, readonly-sql, datajud, whisper

All have `wrangler.toml` in their directory.

---

## Adding a New MCP to the Pipeline

### Custom server (kubernetes-bun)
1. Add to `deploy.json` with `platformName: kubernetes-bun`
2. Add `app.json` — `publish-registry.yml` handles it automatically

### CF Worker MCP
1. Add to `deploy.json` with `platformName: cloudflare-workers`
2. Ensure `wrangler.toml` exists in the MCP dir
3. Optionally add `app.json` for registry metadata

### Official server (app.json only)
1. Just create `app.json` — no `deploy.json` entry needed
2. `publish-registry.yml` auto-detects it as a registry-only MCP

---

## publish-registry.yml

- Filters all changed MCPs that have an `app.json`
- Runs `scripts/publish-one.ts <mcp>` for each
- Posts to `studio.decocms.com/org/deco/registry/publish-request`
- Uses `PUBLISH_API_KEY` secret
- Has `dry_run` option for testing

## Manual Deploy / Publish

Both `deploy.yml` and `publish-registry.yml` support `workflow_dispatch` with a comma-separated `mcps` input:

```
# Deploy specific CF Worker MCPs manually
mcps: "pinecone,reddit"

# Publish specific MCPs to registry manually
mcps: "perplexity,slack-mcp"
```

## Secrets Required

| Secret | Used by |
|--------|---------|
| `DECO_DEPLOY_TOKEN` | deploy.yml (deco deploy CLI) |
| `PUBLISH_API_KEY` | publish-registry.yml |
| `OPENAI_API_KEY` + others | deploy.yml (env vars passed to CF Workers) |
