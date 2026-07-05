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
const devServerNote = `Para confirmar a porta do dev server: \`DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log 2>/dev/null | tail -1 | cut -d: -f2 || echo ${DEV_PORT})\`. Se o dev não estiver rodando (nenhum processo na porta): \`cd /app/repo && nohup bun run dev > /tmp/dev.log 2>&1 & sleep 20 && DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log | tail -1 | cut -d: -f2 || echo ${DEV_PORT})\`. IMPORTANTE: NÃO use \`-- --port\` nem mate o processo existente — o daemon do sandbox gerencia o dev server e reinicializa se morrer.`;

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
2. O repo alvo JÁ está clonado pelo sandbox em /app/repo (origin = ${targetUrl}) — trabalhe NELE, na branch de trabalho: \`cd /app/repo && git checkout -B ${branch}\`. ATENÇÃO: existe um symlink \`org -> ../org\` dentro de /app/repo (montagem do sandbox) — remova antes de tudo: \`rm -f org\`. Copie o conteúdo do original pra dentro SEM rsync (não existe na imagem): \`shopt -s dotglob && for f in /app/source/*; do b=$(basename "$f"); [ "$b" = ".git" ] && continue; cp -r "$f" .; done\`.
3. Em /app/repo: \`npm install @decocms/start tsx\` e rode o script de migração IN PLACE (o script TRANSFORMA o diretório passado em --source): \`npx tsx node_modules/@decocms/start/scripts/migrate.ts --source /app/repo\`. Ele roda 7 fases (analyze, scaffold, transform, cleanup, report, verify, bootstrap). Se /app/repo já tiver MIGRATION_REPORT.md de uma execução anterior, pule esta etapa.
4. Checkpoint final: \`git add -A && git commit -m "feat: tanstack migration (script output)" && git push -u -f origin ${branch}\` (a branch é gerenciada pela migração — o force é seguro).
5. PARE AQUI. Não instale dependências extras, não corrija build, não suba dev server.
${gitAuthNote(ghToken)}
${progressInstruction(site)}

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

# Levantamento (nesta ordem de prioridade)
1. \`cd /app/repo && git checkout ${site.work_branch}\` e \`npm install\`.
2. **Build (gate crítico)**: \`npm run build 2>&1 | tail -60\`. Se FALHAR (exit≠0), o(s) erro(s) que quebram o build são as issues critical/high — foque nelas.
3. Runtime: ${devServerNote} Depois:
   a. \`curl -sL http://localhost:$DEV_PORT/ 2>&1 | head -80\` — HTML vazio/sem \`<body\` = problema de CMS/blocos (não de build).
   b. Se a home vier vazia: \`tail -60 /tmp/dev.log\` + \`ls .deco/blocks/ 2>/dev/null | head -20\` — confira se os \`__resolveType\` batem com os exports de \`src/sections/\` e \`src/apps/\`.
   c. Teste rotas: home, categoria, produto (URLs em /app/source/routes/).
4. Typecheck SECUNDÁRIO: \`npx tsc --noEmit 2>&1 | head -60\` — SÓ se o build passou. Agrupe por causa raiz; entram como severity "low" (dívida de tipo), pois não bloqueiam deploy nem paridade.
5. Compare com /app/source: seções/componentes que existem lá e não foram portados (esses SÃO relevantes — visual/content).

# REGRAS IMPORTANTES
- **NUNCA reporte issue para editar arquivos \`*.gen.ts\`** (manifest.gen, invoke.gen, meta.gen, etc.) — são REGENERADOS pelo \`npm run build\`. Se um import de \`*.gen\` está quebrado, a issue é "rodar npm run build/generate", não "editar o arquivo".
- Se o \`npm run build\` já passa e a home responde, a maior parte do trabalho está feita — reporte poucas issues (só o que afeta paridade/visual), não uma lista de erros de tsc.

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

# Regras
- \`cd /app/repo && git checkout ${site.work_branch}\` antes de tudo (remote: ${targetUrl}).
- Regra de ouro: NUNCA reescreva componentes — porte o original de /app/source com mudanças mecânicas (imports preact→react, class→className, signals→estado react). Consulte /app/source sempre que precisar do comportamento original.
- **NUNCA edite arquivos \`*.gen.ts\`** (manifest.gen, invoke.gen, meta.gen…) — são regenerados pelo \`npm run build\`. Se uma issue aponta erro num \`.gen\`, a correção é rodar \`npm run build\` (que roda o codegen) e verificar se sumiu — NÃO editar o arquivo à mão (seria sobrescrito).
- UM commit POR issue resolvida, mensagem \`fix(#<número>): <o que fez>\` e push ao final de cada uma: \`git push origin ${site.work_branch}\`. Nunca fique >10min sem commit+push.
- **Critério de validação = \`npm run build\` (exit 0)**, não \`tsc --noEmit\`. O build roda o codegen + Vite/esbuild (que não faz type-check estrito). Erros de \`tsc\` que não quebram o build são dívida de tipo aceitável — resolva o que a issue pede sem se prender a zerar o tsc. Para issues de runtime/visual, confirme a rota afetada respondendo. ${devServerNote}
- Se uma issue for impossível, já estiver resolvida (ex: o build já passa e o erro sumiu após o codegen), ou depender de outra, marque como blocked/resolved com o motivo e siga.

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

# Passos
1. \`cd /app/repo && git checkout ${site.work_branch} && git pull origin ${site.work_branch}\`. ${devServerNote}
2. Detecte a porta do dev server: \`DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log 2>/dev/null | tail -1 | cut -d: -f2 || echo 5173)\` (o @cloudflare/vite-plugin usa 5173 por padrão, não 3000).
3. Rode a parity CLI (use sempre @latest): \`cd /app/repo && ${parityEnv} npx -y @decocms/parity@latest run --prod ${site.prod_url} --cand "http://localhost:$DEV_PORT" --preset ci\`
4. Localize o diretório do run: \`RUN_DIR=$(ls -td parity-output/runs/*/ | head -1)\` e leia $RUN_DIR/report.json.
${uploadSteps.length > 0 ? `5. Faça upload dos artefatos:\n${uploadSteps.map((s) => `   ${s}`).join("\n")}` : "5. (sem upload de artefatos configurado)"}
6. Extraia verdict.score do report.json e PARE — nenhuma correção nesta sessão.

${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato:
RESULT_JSON: {"ok": true, "parityScore": <verdict.score do report.json>, "detail": "<resumo do report>"}
(ok=false apenas se a parity CLI nem conseguiu rodar)`;
}
