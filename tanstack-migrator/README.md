# TanStack Migrator MCP

Orquestrador autônomo de migrações **Fresh/Deno → TanStack Start** para storefronts deco, com dashboard (MCP App) para acompanhar fila, paridade e sites 100% TanStack.

## Pipeline

```
draft (backlog — sem slot consumido)
  ↓ SITE_ENQUEUE ou SITE_REGISTER com startNow=true
queued → slot disponível →

  creating_repo         cria deco-sites/<name>-tanstack, configura MINT_REPO_TOKEN
  provisioning_sandbox  VM_START no mesh (driver decopilot, mesmo caminho do agentic CMS)
  baselining            @decocms/parity --prod <prodUrl> --cand <prodUrl>
                        captura métricas Lighthouse/SEO do site original como snapshot "antes"
  migrating_script      sessão claude-code: scripts/migrate.ts do @decocms/start,
                        corrige build, bun dev de pé, push inicial
  opening_pr            abre PR migration/tanstack → main no repo novo
  triaging              claude-code: lê relatório de paridade, prioriza topIssues → issues no GitHub
  fixing                loop: claude-code corrige issues (multi-turn, budget de sessões)
  deploying             sandbox: npm run build + CLOUDFLARE_API_TOKEN wrangler deploy → URL real CF
  paritying             @decocms/parity --prod <prodUrl> --cand <cfWorkerUrl>
                        → score ≥ alvo (95) → awaiting_merge | done
                        → sem melhora por N rodadas → needs_human
  awaiting_merge        polling: PR merged → done 🎉
  done
```

- **% de paridade = `verdict.score` da parity CLI** (heatmaps, seções faltando, hydration, purchase flow).
- A fase `deploying` roda `wrangler deploy` automaticamente quando `CLOUDFLARE_API_TOKEN` está configurado; sem token cai em `needs_human` com instruções manuais.
- Relatórios (report.html + heatmaps) sobem para object storage via presigned PUT e abrem na UI.
- Todo estado vive no Supabase (`sitemig_*`) — o worker retoma de onde parou após restart do pod.
- Watchdog: 30 min sem progresso → `failed`; slot é liberado.

## Backlog e priorização

Sites podem ser registrados sem iniciar a migração (`draft`). A UI do dashboard tem uma aba **Backlog** com ordenação por ↑↓ e botão **Iniciar** por site. O widget de home mostra seção "Próximos" com os drafts/queued em ordem de prioridade.

```
SITE_REGISTER  sourceRepo, prodUrl, [alreadyDone], [startNow]   — default: draft
SITE_ENQUEUE   siteId                                            — draft → queued
SITE_REORDER   orderedIds[]                                      — reordena backlog
```

## Configuração

| Campo | Uso |
|---|---|
| `GITHUB` (binding `@deco/github-mcp`) | criar repos, push do workflow de sync, MINT_REPO_TOKEN |
| `OBJECT_STORAGE` (binding, opcional) | artefatos da parity e baseline (report/heatmaps) |
| `ANTHROPIC_API_KEY` | sessões claude-code + diff visual da parity |
| `CLOUDFLARE_API_TOKEN` | wrangler deploy automático na fase `deploying` |
| `CLOUDFLARE_ACCOUNT_ID` | conta CF para o deploy (padrão: deco-cx) |
| `GITHUB_INSTALLATION_ID` | installation da GitHub App na org deco-sites |
| `SANDBOX_PROVIDER` | `manual` (simulação end-to-end, default) ou `decopilot` (live) |
| `MAX_CONCURRENT`, `PARITY_TARGET`, `MAX_ITERATIONS`, `NO_IMPROVE_LIMIT` | tuning da fila/loop |
| `MESH_API_KEY` | opcional — sem ele o MCP minta uma API key persistente no install (onChange) |

## Primeira vez

1. Aplicar as migrations em ordem no projeto Supabase compartilhado dos MCPs:
   - `migrations/001_sitemig.sql` — schema base
   - `migrations/002_runs_meta.sql` — custo/tokens por run
   - `migrations/003_queue_position.sql` — ordenação do backlog
   - `migrations/004_baseline.sql` — métricas antes/depois
2. Instalar o MCP no studio, conectar o GitHub (binding) e preencher o state.
3. Abrir a tool `TANSTACK_MIGRATOR_DASHBOARD` → cadastrar sites.
4. Com `SANDBOX_PROVIDER=manual` dá pra demonstrar o fluxo inteiro sem efeitos externos.

## Dev

```bash
bun run dev        # server (porta 8001) + vite build --watch da UI
bun test           # testes das funções puras (prompts, summary, grants...)
bun run check      # tsc --noEmit
bun run build      # dist/client/dashboard.html + dist/server/main.js
bun run fmt        # oxfmt (roda automático no pre-commit hook)
```
