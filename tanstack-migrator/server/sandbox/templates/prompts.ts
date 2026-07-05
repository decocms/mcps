/**
 * Prompts for the bounded decopilot sessions that drive a migration inside
 * a mesh sandbox. The session agent has the vm tools (bash/read/write) bound
 * to the site's sandbox, plus the org's MCP tools — including this MCP's
 * MIGRATION_REPORT_PROGRESS for granular progress callbacks.
 *
 * v0.5.0 pipeline: each phase is ONE short session with a narrow contract —
 * the durable memory between sessions lives in GitHub (branch commits +
 * issues), not in the session context.
 *
 * Contract: the FINAL assistant message must contain a single line starting
 * with RESULT_JSON: followed by one JSON object (shape depends on the phase).
 */

import type { SiteRow } from "../../db/types.ts";

export const RESULT_MARKER = "RESULT_JSON:";

/**
 * Cross-migration memory lives in the Studio org-fs (`/app/org` — the same mount
 * the repo's `org` symlink points at) mounted into every sandbox, so these files
 * persist across sandboxes and sites. The agent reads them at session start and
 * appends one-liners when it learns something reusable — turning per-site
 * discovery into shared knowledge. NOT Supabase on purpose: the knowledge
 * belongs to the org's filesystem, reachable by the agent itself.
 *
 *  - framework-notes: SUSPICIONS  ("this looks like a framework bug")
 *  - fixes:           SOLUTIONS   ("this error → this fix worked")
 *  - conventions:     SETUP GOTCHAS of the migration itself
 *  - parity-gotchas:  recurring VISUAL mismatches and how they were resolved
 */
export const MEMORY_DIR = "/app/org/home/.tanstack-migrator";
export const FRAMEWORK_NOTES_PATH = `${MEMORY_DIR}/framework-notes.md`;
export const FIXES_PATH = `${MEMORY_DIR}/fixes.md`;
export const CONVENTIONS_PATH = `${MEMORY_DIR}/conventions.md`;
export const PARITY_GOTCHAS_PATH = `${MEMORY_DIR}/parity-gotchas.md`;

interface MemorySpec {
  path: string;
  /** one-line description of what the file holds */
  holds: string;
  /** how to use what it says (read guidance) */
  read: string;
  /** condition to append a line (omit = read-only for this phase) */
  writeWhen?: string;
  /** the payload after the `timestamp | site` columns */
  entry?: string;
}

/**
 * Render the shared "# Memória entre migrações" section for a phase prompt from
 * a list of file specs. Keeps every phase's memory instructions consistent
 * (same dir, same one-line-append discipline, same dedupe rule).
 */
function memorySection(site: SiteRow, specs: MemorySpec[]): string {
  const blocks = specs.map((s) => {
    const lines = [
      `- **${s.path}** — ${s.holds}`,
      `  LEIA no início (\`cat ${s.path} 2>/dev/null\`): ${s.read}`,
    ];
    if (s.writeWhen) {
      lines.push(
        `  APENDE quando ${s.writeWhen}: \`mkdir -p ${MEMORY_DIR} && echo "$(date -u +%FT%TZ) | ${site.name} | ${s.entry}" >> ${s.path}\``,
      );
    }
    return lines.join("\n");
  });
  return `# Memória entre migrações (org-fs do Studio — persiste entre sandboxes)
Arquivos compartilhados da org já montados no sandbox. Regra: entradas de UMA linha; NÃO duplique uma linha que já exista equivalente.
${blocks.join("\n")}`;
}

// Reusable specs (read guidance/write conditions are phase-agnostic).
const FRAMEWORK_NOTES_SPEC: MemorySpec = {
  path: FRAMEWORK_NOTES_PATH,
  holds:
    "erros SUSPEITOS de bug do framework (@decocms/start / @decocms/apps) vistos em migrações anteriores",
  read: 'se algum bater com o que você achou, cite no corpo da issue ("já visto em N sites — provável bug de framework")',
  writeWhen:
    "achar um erro NOVO com cara de framework (stack dentro de node_modules de @decocms/*, ou padrão não-corrigível no código do site)",
  entry: "<assinatura curta do erro> | <arquivo:linha ou pacote>",
};
const FIXES_SPEC: MemorySpec = {
  path: FIXES_PATH,
  holds:
    "receitas de correção que JÁ FUNCIONARAM em outros sites (erro → solução)",
  read: "se um erro seu casa com uma receita, APLIQUE-A antes de investigar do zero",
};
const CONVENTIONS_SPEC: MemorySpec = {
  path: CONVENTIONS_PATH,
  holds:
    "convenções/gotchas de setup da migração (predev, symlink `org`, porta do dev, não tem rsync, etc.)",
  read: "confira se alguma se aplica a este repo antes de começar",
};
const PARITY_GOTCHAS_SPEC: MemorySpec = {
  path: PARITY_GOTCHAS_PATH,
  holds: "mismatches VISUAIS recorrentes e como foram resolvidos",
  read: "útil pras issues de visual/content e pra chegar em paridade mais rápido",
};

export interface ParityArtifactUrls {
  reportHtmlPut?: string;
  reportJsonPut?: string;
  heatmapPuts?: string[];
}

/** Issue proposed by a triage/parity session — the MCP turns it into a GitHub issue. */
export interface IssueDraft {
  title: string;
  body?: string;
  severity?: string;
  category?: string;
  page?: string;
}

export interface SessionResult {
  ok: boolean;
  parityScore?: number;
  detail?: string;
  /** triage: problems to persist as GitHub issues. */
  issues?: IssueDraft[];
  /** fix: GitHub issue numbers the session claims to have resolved (pushed). */
  resolved?: number[];
  /** fix: issues the session could not resolve, with the reason. */
  blocked?: Array<{ number: number; reason?: string }>;
}

/**
 * First balanced {...} object in `text` — brace scanner that respects JSON
 * strings/escapes. A non-greedy regex truncates at the first `}` and breaks
 * any payload with nested objects (issues[], blocked[]).
 */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseResultJson(output: string): SessionResult | null {
  const idx = output.lastIndexOf(RESULT_MARKER);
  if (idx === -1) return null;
  const json = extractBalancedJson(output.slice(idx + RESULT_MARKER.length));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[])
          .filter(
            (i): i is Record<string, unknown> =>
              !!i &&
              typeof i === "object" &&
              typeof (i as Record<string, unknown>).title === "string",
          )
          .map((i) => ({
            title: String(i.title),
            body: typeof i.body === "string" ? i.body : undefined,
            severity: typeof i.severity === "string" ? i.severity : undefined,
            category: typeof i.category === "string" ? i.category : undefined,
            page: typeof i.page === "string" ? i.page : undefined,
          }))
      : undefined;
    const resolved = Array.isArray(parsed.resolved)
      ? (parsed.resolved as unknown[]).filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n),
        )
      : undefined;
    const blocked = Array.isArray(parsed.blocked)
      ? (parsed.blocked as unknown[])
          .filter(
            (b): b is Record<string, unknown> =>
              !!b &&
              typeof b === "object" &&
              typeof (b as Record<string, unknown>).number === "number",
          )
          .map((b) => ({
            number: b.number as number,
            reason: typeof b.reason === "string" ? b.reason : undefined,
          }))
      : undefined;

    return {
      ok: parsed.ok === true,
      parityScore:
        typeof parsed.parityScore === "number" ? parsed.parityScore : undefined,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
      issues,
      resolved,
      blocked,
    };
  } catch {
    return null;
  }
}

const progressInstruction = (site: SiteRow) =>
  `Se a tool MIGRATION_REPORT_PROGRESS (MCP tanstack-migrator) estiver disponível, chame-a ao concluir passos relevantes com {"siteId": "${site.id}", "detail": "<o que acabou de fazer>"} (e "parityScore" quando tiver score novo). Se ela NÃO estiver no seu conjunto de tools, siga sem reportar — NUNCA tente chamá-la às cegas. O mais importante: a linha RESULT_JSON no fim da sua última mensagem é OBRIGATÓRIA em qualquer cenário — emita-a antes de qualquer passo opcional.`;

function repoUrl(full: string | null, ghToken?: string): string {
  if (!full) throw new Error("repo not set");
  return ghToken
    ? `https://x-access-token:${ghToken}@github.com/${full}.git`
    : `https://github.com/${full}.git`;
}

const gitAuthNote = (ghToken?: string) =>
  ghToken
    ? ""
    : "\nObs: o git do sandbox já está autenticado (credenciais sincronizadas pelo mesh) — clone e push funcionam com as URLs https normais.";

// A porta do dev server é determinada pelo script do projeto (wrangler usa 5173
// por padrão quando @cloudflare/vite-plugin está configurado). NUNCA matar o
// processo existente gerenciado pelo daemon — apenas detectar a porta real.
const DEV_PORT = 5173; // fallback; sempre confirmar com DEV_LOG

/**
 * "Script de start" idempotente que TODA sessão de sessão (triage/fix/parity)
 * roda como passo 0. O sandbox pode chegar em qualquer estado — clone fresco
 * pós-recreate, sandbox reapado+recriado, ou generates defasados — então antes
 * de qualquer trabalho o agente traz o projeto a um estado bom conhecido:
 *   0. /app/source (clone do original deco.cx) — SOME no recreate do sandbox
 *      (o clone só rodava no migrate); sem ele o fix não tem de onde portar
 *   1. branch certa + pull do último push
 *   2. deps limpas (node_modules NUNCA vem da branch — é gitignored)
 *   3. generates gitignored (routeTree.gen.ts, *.gen.* do cms/admin) — sem eles
 *      o router não tem rotas e o dev serve o placeholder "No web page"
 *   4. dev server de pé servindo HTML real (sobe só se não estiver servindo)
 * Isso torna cada fase self-healing: não depende do sandbox ter sido recriado
 * corretamente na fase anterior.
 */
function ensureReadyPreamble(site: SiteRow, ghToken?: string): string {
  const branch = site.work_branch;
  const sourceUrl = repoUrl(site.source_repo, ghToken);
  return `# Setup (rode ISTO PRIMEIRO, sempre — deixa o projeto de pé antes de qualquer coisa)
Este bloco é idempotente e self-healing: rode-o inteiro antes de analisar/corrigir/medir. Não pule.
\`\`\`bash
# /app/source = clone pristino do site deco.cx original (p/ portar componentes/comparar). SOME no recreate
# do sandbox — reclona idempotente. NUNCA modifique nem rode o migrate nele.
[ -d /app/source/.git ] || git clone --depth 1 -b ${site.source_branch} ${sourceUrl} /app/source 2>/dev/null || true
cd /app/repo && git checkout ${branch} && git pull origin ${branch} 2>/dev/null || true
rm -f org 2>/dev/null || true                          # symlink de montagem do sandbox
[ -d node_modules ] || bun install || npm install       # deps limpas (node_modules é gitignored — nunca vem da branch)
# generates gitignored: sem routeTree.gen.ts o router fica sem rotas → placeholder "No web page"
if [ ! -f src/routeTree.gen.ts ]; then bun run predev 2>/dev/null || npm run predev 2>/dev/null || bun run build 2>/dev/null || npm run build 2>/dev/null || true; fi
# dev server: sobe só se ainda não estiver servindo (o daemon do sandbox pode já ter subido)
DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log 2>/dev/null | tail -1 | cut -d: -f2 || echo ${DEV_PORT})
curl -sf "http://localhost:$DEV_PORT/" >/dev/null 2>&1 || { nohup bun run dev > /tmp/dev.log 2>&1 & sleep 20; DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log | tail -1 | cut -d: -f2 || echo ${DEV_PORT}); }
\`\`\`
NÃO mate o processo do dev gerenciado pelo daemon nem force \`--port\`. Se depois desse bloco \`curl http://localhost:$DEV_PORT/\` AINDA devolver o placeholder "No web page at this URL" ou um shell vazio, aí sim o SSR está quebrado de verdade — investigue \`tail -80 /tmp/dev.log\`.`;
}

/**
 * Phase migrating_script: run the migrate script and push the checkpoint to
 * the work branch. Deliberately does NOT fix the build — that's the fixing
 * loop's job, driven by GitHub issues. Ending at the checkpoint keeps the
 * session far from the turn/window limit that killed the monolithic design.
 */
export function migrateScriptPrompt(input: {
  site: SiteRow;
  ghToken?: string;
}): string {
  const { site, ghToken } = input;
  const sourceUrl = repoUrl(site.source_repo, ghToken);
  const targetUrl = repoUrl(site.target_repo, ghToken);
  const branch = site.work_branch;

  return `Você é o agente de migração Fresh→TanStack da deco. Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Seja objetivo e não peça confirmação — execute até o fim.

# Objetivo (ESCOPO FECHADO)
Rodar o script de migração de ${site.source_repo} (Fresh/Deno) para TanStack Start e dar push do resultado BRUTO na branch ${branch} de ${site.target_repo}. NÃO corrija erros de build/typecheck nesta sessão — os problemas serão catalogados como issues e resolvidos em sessões seguintes.

# Regra de ouro
Nunca fique mais de 10 minutos sem \`git commit\` + \`git push\` — todo progresso precisa sobreviver à queda da sessão.

# Passos
1. Se /app/source ainda não existe: \`git clone --depth 1 -b ${site.source_branch} ${sourceUrl} /app/source\` (cópia pristina do site original — NUNCA modifique nem rode o script de migração nela).
2. O repo alvo JÁ está clonado pelo sandbox em /app/repo (origin = ${targetUrl}). Entre nele e SINCRONIZE com o remoto ANTES de qualquer coisa (o clone do sandbox pode estar defasado — fixes podem ter sido pushados por fora; num re-run isso evita sobrescrever trabalho): \`cd /app/repo && rm -f org && git fetch origin ${branch} 2>/dev/null && git checkout -B ${branch} FETCH_HEAD 2>/dev/null || git checkout -B ${branch}\` (o symlink \`org -> ../org\` é montagem do sandbox — sempre remova). IDEMPOTÊNCIA: só copie o original se for migração NOVA (sem MIGRATION_REPORT.md) — num re-run copiar por cima sobrescreve o resultado migrado. E NUNCA copie \`node_modules\`/artefatos de build (vendorar deps de versão errada na branch quebra o dev no sandbox — o daemon faz install limpo). Copie SEM rsync (não existe na imagem): \`if [ ! -f MIGRATION_REPORT.md ]; then shopt -s dotglob && for f in /app/source/*; do b=$(basename "$f"); case "$b" in .git|node_modules|dist|.wrangler|.vite|.tanstack|.cache) continue;; esac; cp -r "$f" .; done; fi\`.
3. Em /app/repo: \`npm install @decocms/start tsx\` e rode o script de migração IN PLACE (o script TRANSFORMA o diretório passado em --source): \`npx tsx node_modules/@decocms/start/scripts/migrate.ts --source /app/repo\`. Ele roda 7 fases (analyze, scaffold, transform, cleanup, report, verify, bootstrap). Se /app/repo já tiver MIGRATION_REPORT.md de uma execução anterior, pule esta etapa.
4. CRÍTICO p/ o preview do sandbox renderizar (config PROVADA nos sites que rodam no agentic CMS, ex: granadobr-tanstack): o daemon do sandbox roda \`bun run dev\` = \`vite dev\` DIRETO e \`src/setup.ts\` importa \`./server/cms/blocks.gen\` de forma ESTÁTICA. Se qualquer gen do deco faltar no clone, o SSR estoura e \`/\` responde não-HTML → o proxy serve "No web page". No \`vite dev\` só o **routeTree** é regenerado de forma confiável (plugin tanstackStart). Portanto:
   a. \`package.json\`: \`"dev": "vite dev"\` (SEM \`predev\` — se existir um script \`predev\`, o \`bun run dev\` do daemon dispara o lifecycle e diverge do que funciona; REMOVA o \`predev\`). Mantenha \`build\` com a chain completa de generates + \`vite build\`, e os scripts \`generate:*\`.
   b. Rode os generates uma vez: \`npm install @decocms/start tsx && npm run build\` (ou a chain de generates sem o \`vite build\`).
   c. \`.gitignore\`: ignore **apenas** \`src/routeTree.gen.ts\` e \`.tanstack/\` (o tanstackStart regenera o routeTree). REMOVA qualquer linha que ignore \`src/server/cms/*.gen.*\`, \`blocks.gen.*\` ou \`src/server/admin/*.gen.*\`.
   d. COMITE todos os gens (menos o routeTree), com \`git add -f\` se necessário: \`src/server/cms/blocks.gen.json\`, \`src/server/cms/blocks.gen.ts\`, \`src/server/cms/sections.gen.ts\`, \`src/server/cms/loaders.gen.ts\`, \`src/server/admin/meta.gen.json\`, \`src/server/invoke.gen.ts\` e \`src/*/manifest.gen.ts\`.
   e. \`wrangler.jsonc\`: garanta \`compatibility_flags\` com \`"nodejs_compat"\` E \`"no_handle_cross_request_promise_resolution"\` (evita worker travado; ambos os sites que funcionam têm).
5. Checkpoint final. ANTES do commit, garanta que \`node_modules\`/artefatos NUNCA vão pra branch (node_modules commitado carrega deps de versão errada — ex: vite diferente do package.json — e quebra o dev no sandbox): \`grep -qxF 'node_modules/' .gitignore 2>/dev/null || printf '\\nnode_modules/\\ndist/\\n.wrangler/\\n.vite/\\n' >> .gitignore; git rm -r --cached --quiet node_modules dist .wrangler .vite 2>/dev/null || true\` (NÃO remova os \`*.gen.*\` do deco nem o \`.tanstack\` já tratado no passo 4). Depois comite TAMBÉM os gens do passo 4d e: \`git add -A && git add -f src/server/cms/*.gen.* src/server/admin/*.gen.* src/server/invoke.gen.ts && git commit -m "feat: tanstack migration (script output + committed gens)" && git push -u -f origin ${branch}\` (a branch é gerenciada pela migração — o force é seguro).
6. PARE AQUI. Não corrija erros de build — isso é das próximas fases.
${gitAuthNote(ghToken)}
${progressInstruction(site)}

${memorySection(site, [
  {
    ...CONVENTIONS_SPEC,
    writeWhen:
      "descobrir um passo de setup NOVO que não está nos Passos acima (ex: script extra necessário pro dev subir, dependência faltando)",
    entry: "<convenção/gotcha de setup em uma linha>",
  },
])}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato:
RESULT_JSON: {"ok": true, "detail": "script rodou, checkpoint pushado na branch ${branch}"}
(ok=false com detail explicando o bloqueio se não conseguir terminar)`;
}

const ISSUE_BODY_TEMPLATE = `## Contexto
<arquivo(s)/página(s) afetados e o que deveria acontecer>
## Erro
<mensagem de erro ou comportamento observado (trecho literal)>
## Como reproduzir
<comando ou URL>
## Dica de fix
<direção: qual componente portar de /app/source, qual import trocar, etc.>`;

/**
 * Phase triaging: analyze-only survey of the migrated code. Its issues[]
 * become GitHub issues (created MCP-side, deduped, capped) — the durable
 * backlog that the fixing loop drains.
 */
export function triagePrompt(input: {
  site: SiteRow;
  maxIssues: number;
}): string {
  const { site, maxIssues } = input;

  return `Você é o agente de triagem da migração ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Não peça confirmação.

# Objetivo (SOMENTE ANÁLISE — NÃO CORRIJA NADA)
Levantar os problemas REAIS do código migrado em /app/repo e reportá-los como issues no RESULT_JSON. Cada issue precisa ser resolvível SEM contexto além do próprio texto.

# O que "pronto" significa (LEIA ANTES)
O critério de sucesso desta migração é: **\`npm run build\` passa** (exit 0) + o site responde HTML + paridade visual bate. NÃO é \`tsc --noEmit\` zerado. O \`npm run build\` roda o codegen (generate:blocks/sections/loaders/schema/invoke) e o Vite/esbuild — que NÃO faz type-check estrito. Erros de \`tsc\` que NÃO quebram o \`npm run build\` são **dívida de tipo**, não bloqueadores: reporte-os como severity "low", nunca critical/high.

${ensureReadyPreamble(site)}

# Levantamento (nesta ordem de prioridade)
1. **Build (gate crítico)**: \`npm run build 2>&1 | tail -60\`. Se FALHAR (exit≠0), o(s) erro(s) que quebram o build são as issues critical/high — foque nelas.
2. **Runtime — o site TEM que renderizar HTML (pré-requisito da paridade)**: com o dev já de pé pelo Setup, \`curl -sL http://localhost:$DEV_PORT/ 2>&1 | head -120\`:
   a. Se retornar **"No web page at this URL"** (placeholder do sandbox) OU um shell quase vazio (só \`<div id="root"></div>\` sem conteúdo) → o **SSR está quebrado**: o dev sobe mas \`/\` não devolve HTML renderizado (severity **high**, category **runtime**). Causa comum #1: **node_modules com versão errada** (se foi commitado na branch, ex: vite ≠ package.json) — a correção é \`rm -rf node_modules && npm install\` e nunca commitar node_modules. Investigue também \`tail -80 /tmp/dev.log\` pelo stack do SSR (\`is not a function\`, módulo faltando) e abra o arquivo:linha.
   a2. Se \`/\` DEVOLVE HTML (200, milhares de bytes) mas contém \`Switched to client rendering because the server rendering errored\` → o SSR **degradou pra client-render**: a página renderiza, mas com um bug de SSR real (severity **medium**, runtime). Grep o stack: \`curl -sL http://localhost:$DEV_PORT/ | grep -o "server rendering errored[^<]*"\` e \`tail -80 /tmp/dev.log\`. Causa MAIS comum: **globais client-only usados no render do server** (\`globalThis.location\`, \`window\`, \`document\`) → dá \`Cannot read properties of undefined (reading 'href')\`. Fix: guardar com \`typeof window !== "undefined"\` (ou mover pra useEffect). Reporte com o arquivo:linha.
   b. Se \`/\` renderiza mas os blocos estão vazios: \`ls .deco/blocks/ 2>/dev/null | head -20\` — confira se os \`__resolveType\` batem com os exports de \`src/sections/\` e \`src/apps/\`.
   c. Teste rotas: home, categoria, produto (URLs em /app/source/routes/).
3. Typecheck SECUNDÁRIO: \`npx tsc --noEmit 2>&1 | head -60\` — SÓ se o build passou. Agrupe por causa raiz; entram como severity "low" (dívida de tipo), pois não bloqueiam deploy nem paridade.
4. Compare com /app/source: seções/componentes que existem lá e não foram portados (esses SÃO relevantes — visual/content).

# REGRAS IMPORTANTES
- **NUNCA reporte issue para editar arquivos \`*.gen.ts\`** (manifest.gen, invoke.gen, meta.gen, etc.) — são REGENERADOS pelo \`npm run build\`. Se um import de \`*.gen\` está quebrado, a issue é "rodar npm run build/generate", não "editar o arquivo".
- **Suspeita de bug do framework**: se um erro parece vir de \`@decocms/start\` ou \`@decocms/apps\` (stack aponta pra dentro de node_modules desses pacotes, ou é um padrão que não dá pra corrigir no código do site), prefixe o título com \`[framework?]\` e use category **infra** — o MCP cataloga esses para detectar bugs recorrentes do framework entre sites.
- Se o \`npm run build\` já passa E o site renderiza HTML real em \`/\`, a maior parte do trabalho está feita — reporte poucas issues (só o que afeta paridade/visual).

${memorySection(site, [
  FRAMEWORK_NOTES_SPEC,
  FIXES_SPEC,
  CONVENTIONS_SPEC,
  PARITY_GOTCHAS_SPEC,
])}

# Formato das issues
- No máximo ${maxIssues} issues, ordenadas da mais grave para a menos grave.
- severity: "critical" (npm run build falha) | "high" (rota 500/página não renderiza) | "medium" (seção faltando, hydration, visual quebrado) | "low" (dívida de tipo do tsc, warning, estilo).
- category: "build" | "runtime" | "visual" | "content" | "infra".
- body ≤ 1200 caracteres, seguindo o template:
${ISSUE_BODY_TEMPLATE}

${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato (JSON válido, uma linha):
RESULT_JSON: {"ok": true, "detail": "<resumo: N issues, estado geral>", "issues": [{"title": "...", "body": "...", "severity": "critical", "category": "build", "page": "/"}]}
(ok=false apenas se nem conseguiu analisar o repo)`;
}

/**
 * Phase fixing: resolve ONLY the listed issues (bodies inlined — the session
 * has no GitHub access). One commit per issue so progress is auditable.
 */
export function fixIssuesPrompt(input: {
  site: SiteRow;
  issues: Array<{ number: number; title: string; body?: string }>;
  ghToken?: string;
}): string {
  const { site, issues, ghToken } = input;
  const targetUrl = repoUrl(site.target_repo, ghToken);
  const list = issues
    .map(
      (i) =>
        `## Issue #${i.number}: ${i.title}\n${(i.body ?? "(sem corpo)").slice(0, 1500)}`,
    )
    .join("\n\n");

  return `Você é o agente de correção da migração ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Não peça confirmação.

# Objetivo (ESCOPO FECHADO)
Resolver SOMENTE as issues listadas abaixo. Não refatore nada fora delas, não "aproveite pra melhorar" outras coisas.

${ensureReadyPreamble(site, ghToken)}

# Regras
- Remote da branch: ${targetUrl} (o Setup acima já fez checkout + pull).
- Regra de ouro: NUNCA reescreva componentes — porte o original de /app/source com mudanças mecânicas (imports preact→react, class→className, signals→estado react). Consulte /app/source sempre que precisar do comportamento original.
- **NUNCA edite arquivos \`*.gen.ts\`** (manifest.gen, invoke.gen, meta.gen…) — são regenerados pelo \`npm run build\`. Se uma issue aponta erro num \`.gen\`, a correção é rodar \`npm run build\` (que roda o codegen) e verificar se sumiu — NÃO editar o arquivo à mão (seria sobrescrito).
- UM commit POR issue resolvida, mensagem \`fix(#<número>): <o que fez>\` e push ao final de cada uma: \`git push origin ${site.work_branch}\`. Nunca fique >10min sem commit+push.
- **Critério de validação = \`npm run build\` (exit 0)**, não \`tsc --noEmit\`. O build roda o codegen + Vite/esbuild (que não faz type-check estrito). Erros de \`tsc\` que não quebram o build são dívida de tipo aceitável — resolva o que a issue pede sem se prender a zerar o tsc. Para issues de runtime/visual, confirme a rota afetada respondendo (o dev já está de pé pelo Setup).
- **O preview TEM que renderizar (pré-requisito da paridade)**: para issues de runtime/SSR, a correção só está pronta quando \`curl -sL http://localhost:$DEV_PORT/\` devolve HTML renderizado de verdade — NÃO o placeholder "No web page at this URL" nem um shell vazio (\`<div id="root"></div>\` sem conteúdo). Se ainda vier placeholder/shell, o SSR continua quebrado: leia \`tail -80 /tmp/dev.log\`, ache o stack e o arquivo:linha, e corrija de verdade antes de marcar como resolved.
- **Antes de investigar do zero, consulte a "Memória entre migrações" abaixo** — uma receita conhecida pode resolver na hora, e o que você aprender aqui alimenta os próximos sites. Se concluir que um erro vem do framework, marque a issue como blocked com motivo \`[framework?]\` além de registrar na memória.
- Se uma issue for impossível, já estiver resolvida (ex: o build já passa e o erro sumiu após o codegen), ou depender de outra, marque como blocked/resolved com o motivo e siga.

${memorySection(site, [
  FRAMEWORK_NOTES_SPEC,
  {
    ...FIXES_SPEC,
    writeWhen:
      "resolver um erro de runtime/build e CONFIRMAR que sumiu (build passa / rota responde)",
    entry:
      "<assinatura do erro> → <o que resolveu: arquivo/import/patch curto>",
  },
  {
    ...CONVENTIONS_SPEC,
    writeWhen: "descobrir um gotcha de setup novo durante o fix",
    entry: "<convenção/gotcha em uma linha>",
  },
  {
    ...PARITY_GOTCHAS_SPEC,
    writeWhen: "resolver um mismatch visual/de conteúdo",
    entry: "<mismatch visual> → <como resolveu>",
  },
])}

# Receitas conhecidas (padrões que JÁ funcionaram em migrações deco.cx→TanStack)
Se o erro bater com um destes, aplique direto — não reinvente nem gaste sessão investigando loader por loader:
- **Section loader usa \`ctx.algo\` e estoura \`Cannot read properties of undefined\`** (ex: \`ctx.device\`, \`ctx.invoke\`, \`ctx.salesforce\`, \`ctx.features\`): o \`@decocms/start\` invoca o loader como \`(props, req)\` — o 3º arg \`ctx\` quase sempre vem \`undefined\` (o start só compõe device/search params; salesforce/features/invoke NEM sempre são injetados). Fix comprovado: torne \`ctx\` OPCIONAL (\`ctx?: AppContext\`) e use optional-chaining em TODO acesso, com fallback: \`ctx?.device\`, \`ctx?.salesforce?.x\`, \`ctx?.features?.y ?? false\`. Para device no componente, use o hook \`useDevice()\` de \`@decocms/start/sdk/useDevice\` (não \`ctx.device\`). E NÃO faça fetch pesado via \`ctx.invoke\` dentro do section loader — o loader deve só derivar props baratas. (Isso destrava a home inteira: cada loader que estoura deixa a seção vazia → página em branco.)
- **\`defaultLoader\`/\`DefaultProps\` não definidos** (seções de SEO tipo SeoPDP/SeoPLP): são convenções do deco.cx Fresh que não existem no start. Fix comprovado: importe \`renderTemplateString\`, \`type SEOSection\`, \`type Props as SeoProps\` de \`@decocms/apps/website/components/Seo\` e faça a normalização de title/description/canonical INLINE (assinatura \`(props, req): SeoProps\`, sem \`ctx\` nem \`defaultLoader\`).
Ambos têm causa raiz no migrate transform do \`@decocms/start\` (não converte a API \`ctx.*\`/\`defaultLoader\` do deco.cx) — registre no \`framework-notes.md\` com prefixo \`[framework?]\`.

# Issues a resolver
${list}

${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato (JSON válido, uma linha):
RESULT_JSON: {"ok": true, "detail": "<resumo>", "resolved": [${issues[0]?.number ?? 12}], "blocked": [{"number": 34, "reason": "..."}]}
(resolved = issues com fix COMMITADO E PUSHADO; ok=false apenas se não conseguiu trabalhar)`;
}

/**
 * Phase paritying: measure-only parity run. The MCP converts the report's
 * topIssues into GitHub issues (deduped against the open backlog).
 */
export function parityOnlyPrompt(input: {
  site: SiteRow;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  artifacts?: ParityArtifactUrls;
}): string {
  const { site, artifacts } = input;
  const parityEnv = [
    input.anthropicApiKey ? `ANTHROPIC_API_KEY=${input.anthropicApiKey}` : "",
    input.openrouterApiKey
      ? `OPENROUTER_API_KEY=${input.openrouterApiKey}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const uploadSteps: string[] = [];
  if (artifacts?.reportHtmlPut) {
    uploadSteps.push(
      `curl -sf -X PUT -H "Content-Type: text/html" --upload-file "$RUN_DIR/report.html" '${artifacts.reportHtmlPut}'`,
    );
  }
  if (artifacts?.reportJsonPut) {
    uploadSteps.push(
      `curl -sf -X PUT -H "Content-Type: application/json" --upload-file "$RUN_DIR/report.json" '${artifacts.reportJsonPut}'`,
    );
  }
  (artifacts?.heatmapPuts ?? []).forEach((url, i) => {
    uploadSteps.push(
      `H=$(ls "$RUN_DIR"/screenshots/heatmap_*.png 2>/dev/null | sed -n '${i + 1}p'); [ -n "$H" ] && curl -sf -X PUT -H "Content-Type: image/png" --upload-file "$H" '${url}' || true`,
    );
  });

  return `Você é o agente de medição de paridade da migração ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Não peça confirmação.

# Objetivo (SOMENTE MEDIÇÃO — NÃO CORRIJA NADA)
Rodar a parity CLI comparando produção vs candidato, subir os artefatos e reportar o score. Os problemas apontados pelo report viram issues no GitHub e serão corrigidos em outras sessões.

${ensureReadyPreamble(site)}

# Passos
1. Rode a parity CLI (use sempre @latest): \`cd /app/repo && ${parityEnv} npx -y @decocms/parity@latest run --prod ${site.prod_url} --cand "http://localhost:$DEV_PORT" --preset ci\`
2. Localize o diretório do run: \`RUN_DIR=$(ls -td parity-output/runs/*/ | head -1)\` e leia $RUN_DIR/report.json.
${uploadSteps.length > 0 ? `3. Faça upload dos artefatos:\n${uploadSteps.map((s) => `   ${s}`).join("\n")}` : "3. (sem upload de artefatos configurado)"}
4. Extraia verdict.score do report.json e PARE — nenhuma correção nesta sessão.

${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato:
RESULT_JSON: {"ok": true, "parityScore": <verdict.score do report.json>, "detail": "<resumo do report>"}
(ok=false apenas se a parity CLI nem conseguiu rodar)`;
}
