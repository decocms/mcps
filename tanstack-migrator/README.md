# TanStack Migrator MCP

Autonomous orchestrator for **Fresh/Deno → TanStack Start** migrations of deco storefronts, with a dashboard (MCP App) to track the queue, parity and fully-migrated (100% TanStack) sites.

## Pipeline

```
draft (backlog — no slot consumed)
  ↓ SITE_ENQUEUE or SITE_REGISTER with startNow=true
queued → slot available →

  creating_repo         creates deco-sites/<name>-tanstack, sets up MINT_REPO_TOKEN
  provisioning_sandbox  VM_START on the mesh (decopilot driver, same path as the agentic CMS)
  baselining            @decocms/parity --prod <prodUrl> --cand <prodUrl>
                        captures Lighthouse/SEO metrics of the original site as a "before" snapshot
  migrating_script      claude-code session: @decocms/start scripts/migrate.ts,
                        fixes the build, dev server up, initial push
  opening_pr            opens PR migration/tanstack → main on the new repo
  triaging              claude-code: reads the parity report, prioritizes topIssues → GitHub issues
  fixing                loop: claude-code fixes issues (multi-turn, session budget)
  deploying             sandbox: npm run build + CLOUDFLARE_API_TOKEN wrangler deploy → real CF URL
  paritying             @decocms/parity --prod <prodUrl> --cand <cfWorkerUrl>
                        → score ≥ target (95) → awaiting_merge | done
                        → no improvement for N rounds → needs_human
  awaiting_merge        polling: PR merged → done 🎉
  done
```

- **Parity % = the parity CLI's `verdict.score`** (heatmaps, missing sections, hydration, purchase flow).
- The `deploying` phase runs `wrangler deploy` automatically when `CLOUDFLARE_API_TOKEN` is set; without a token it falls back to `needs_human` with manual instructions.
- Reports (report.html + heatmaps) are uploaded to object storage via presigned PUT and open in the UI.
- All state lives in Supabase (`sitemig_*`) — the worker resumes where it left off after a pod restart.
- Watchdog: 30 min without progress → `failed`; the slot is released.

## Backlog and prioritization

Sites can be registered without starting the migration (`draft`). The dashboard UI has a **Backlog** tab with ↑↓ ordering and a per-site **Start** button. The home widget shows an "Up next" section with drafts/queued in priority order.

```
SITE_REGISTER  sourceRepo, prodUrl, [alreadyDone], [startNow]   — default: draft
SITE_ENQUEUE   siteId                                            — draft → queued
SITE_REORDER   orderedIds[]                                      — reorder backlog
```

## Cost-based suggestions (COGS)

The queue widget, when widened, shows a **Suggestions** column ranking the next sites to migrate by monthly infra cost (COGS). Costs come from the [grafana MCP](../grafana) via a `GRAFANA` binding (`server/lib/grafana.ts` → `fetchSiteCosts`), cached in `sitemig_cost_snapshot` for 12h (`server/db/cost.ts`). `SITE_SUGGESTIONS` joins the decocms site catalog for repo/prod URL/logo and excludes already-registered sites.

## Configuration

| Field | Use |
|---|---|
| `GITHUB` (binding `@deco/github-mcp`) | create repos, push the sync workflow, MINT_REPO_TOKEN |
| `OBJECT_STORAGE` (binding, optional) | parity + baseline artifacts (report/heatmaps) |
| `GRAFANA` (binding, optional) | per-site COGS for the migration suggestions |
| `ANTHROPIC_API_KEY` | claude-code sessions + parity visual diff |
| `CLOUDFLARE_API_TOKEN` | automatic wrangler deploy in the `deploying` phase |
| `CLOUDFLARE_ACCOUNT_ID` | CF account for the deploy (default: deco-cx) |
| `GITHUB_INSTALLATION_ID` | GitHub App installation on the deco-sites org |
| `COGS_PROMQL`, `GRAFANA_DATASOURCE_UID` | PromQL + datasource for per-site cost |
| `SANDBOX_PROVIDER` | `manual` (end-to-end simulation, default) or `decopilot` (live) |
| `MAX_CONCURRENT`, `PARITY_TARGET`, `MAX_ITERATIONS`, `NO_IMPROVE_LIMIT` | queue/loop tuning |
| `MESH_API_KEY` | optional — without it the MCP mints a persistent API key on install (onChange) |

## First run

1. Apply the migrations in order on the MCPs' shared Supabase project:
   - `migrations/001_sitemig.sql` — base schema
   - `migrations/002_issue_pipeline.sql` — issue pipeline + cost/tokens per run
   - `migrations/003_queue_position.sql` — backlog ordering
   - `migrations/004_baseline.sql` — before/after metrics
   - `migrations/005_assignee.sql` — per-site GitHub assignee
   - `migrations/006_cost.sql` — COGS snapshot cache + before cost
2. Install the MCP in the studio, connect GitHub (binding) and fill in the state.
3. Open the `TANSTACK_MIGRATOR_DASHBOARD` tool → register sites.
4. With `SANDBOX_PROVIDER=manual` you can demo the whole flow with no external effects.

## Dev

```bash
bun run dev        # server (port 8001) + vite build --watch of the UI
bun test           # pure-function tests (prompts, summary, grants...)
bun run check      # tsc --noEmit
bun run build      # dist/client/dashboard.html + dist/server/main.js
bun run fmt        # oxfmt (runs automatically on the pre-commit hook)
```
