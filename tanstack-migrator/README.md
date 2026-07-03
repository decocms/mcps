# TanStack Migrator MCP

Orquestrador autônomo de migrações **Fresh/Deno → TanStack Start** para storefronts deco, com dashboard (MCP App) para acompanhar fila, paridade e sites 100% TanStack.

## Como funciona

```
cadastro (UI) → fila FIFO (1-2 slots)
  → creating_repo         cria deco-sites/<name>-tanstack + grant de push (MINT_REPO_TOKEN)
  → provisioning_sandbox  VM_START no mesh (mesmo caminho do agentic CMS)
  → migrating             sessão decopilot (claude-code) roda scripts/migrate.ts do @decocms/start,
                          corrige build, push inicial, bun dev de pé
  → installing_sync       instala .github/workflows/sync-decofile.yml (conteúdo .deco da produção, cron 30min)
  → validating            loop: @decocms/parity run --prod <prod> --cand <preview> → agente corrige topIssues
                          → para em score ≥ alvo (95) ou N iterações sem melhora → needs_human
  → deploying_cf          cria projeto Workers Builds git-connected (push = deploy)
  → done 🎉
```

- **% de progresso = `verdict.score` da parity CLI** (heatmaps, seções faltando, hydration, purchase flow).
- Relatórios (report.html + heatmaps) sobem para o object storage via presigned PUT e abrem na UI.
- Todo estado vive no Supabase (`sitemig_*`) — o worker retoma de onde parou após restart do pod.
- Watchdog: 30min sem progresso → `failed` e o slot é liberado.

## Estado / instalação

| Campo | Uso |
|---|---|
| `GITHUB` (binding `@deco/github-mcp`) | criar repos, push do workflow de sync, MINT_REPO_TOKEN |
| `OBJECT_STORAGE` (binding, opcional) | artefatos da parity (report/heatmaps) |
| `ANTHROPIC_API_KEY` | sessões claude-code + diff visual da parity |
| `CLOUDFLARE_API_TOKEN` / `ACCOUNT_ID` | criar projeto Workers Builds |
| `GITHUB_INSTALLATION_ID` | installation da GitHub App na org deco-sites |
| `SANDBOX_PROVIDER` | `manual` (simulação end-to-end, default) ou `decopilot` (live) |
| `MAX_CONCURRENT`, `PARITY_TARGET`, `MAX_ITERATIONS`, `NO_IMPROVE_LIMIT` | tuning da fila/loop |
| `MESH_API_KEY` | opcional — sem ele o MCP minta uma API key persistente sozinho no install (onChange) |

## Primeira vez

1. Aplicar `migrations/001_sitemig.sql` no projeto Supabase compartilhado dos MCPs.
2. Instalar o MCP no studio, conectar o GitHub (binding) e preencher o state.
3. Abrir a tool `TANSTACK_MIGRATOR_DASHBOARD` → cadastrar sites.
4. Com `SANDBOX_PROVIDER=manual` dá pra demonstrar o fluxo inteiro sem efeitos externos.

## Dev

```bash
bun run dev        # server (porta 8001) + vite build --watch da UI
bun test           # testes das funções puras (prompts, summary, grants...)
bun run check      # tsc --noEmit
bun run build      # dist/client/dashboard.html + dist/server/main.js
```

## Verificações pendentes (modo live)

- **Spike `/mcp/self`**: criação programática do projeto/virtualMcp bindado ao repo (pré-requisito do `VM_START`) e o `modelId` exato do provider claude-code (`MIGRATOR_DECOPILOT_MODEL` sobrescreve). Isolado em `server/sandbox/drivers/decopilot.ts`.
- **Permissão `workflows`** da GitHub App para push do `sync-decofile.yml` (degrada para `needs_human` com instrução manual).
- **Endpoint do Workers Builds** (`server/lib/cloudflare.ts`) — degrada para `needs_human` com instruções manuais.
