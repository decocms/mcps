/**
 * Prompts for the bounded decopilot sessions that drive a migration inside
 * a mesh sandbox. The session agent has the vm tools (bash/read/write) bound
 * to the site's sandbox, plus the org's MCP tools — including this MCP's
 * MIGRATION_REPORT_PROGRESS for granular progress callbacks.
 *
 * Contract: the FINAL assistant message must contain a single line
 *   RESULT_JSON: {"ok": true|false, "parityScore": <number|null>, "detail": "..."}
 * which the driver parses to decide the phase outcome.
 */

import type { SiteRow } from "../../db/types.ts";

export const RESULT_MARKER = "RESULT_JSON:";

export interface ParityArtifactUrls {
  reportHtmlPut?: string;
  reportJsonPut?: string;
  heatmapPuts?: string[];
}

export function parseResultJson(output: string): {
  ok: boolean;
  parityScore?: number;
  detail?: string;
} | null {
  const idx = output.lastIndexOf(RESULT_MARKER);
  if (idx === -1) return null;
  const rest = output.slice(idx + RESULT_MARKER.length);
  const match = rest.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      ok?: boolean;
      parityScore?: number | null;
      detail?: string;
    };
    return {
      ok: parsed.ok === true,
      parityScore:
        typeof parsed.parityScore === "number" ? parsed.parityScore : undefined,
      detail: parsed.detail,
    };
  } catch {
    return null;
  }
}

const progressInstruction = (site: SiteRow) =>
  `Sempre que concluir um passo relevante, chame a tool MIGRATION_REPORT_PROGRESS do MCP tanstack-migrator com {"siteId": "${site.id}", "detail": "<o que acabou de fazer>"} (e "parityScore" quando tiver um score novo).`;

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

export function migratePrompt(input: {
  site: SiteRow;
  ghToken?: string;
  anthropicApiKey?: string;
}): string {
  const { site, ghToken } = input;
  const sourceUrl = repoUrl(site.source_repo, ghToken);
  const targetUrl = repoUrl(site.target_repo, ghToken);

  return `Você é o agente de migração Fresh→TanStack da deco. Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Seja objetivo e não peça confirmação — execute até o fim.

# Objetivo
Migrar o storefront ${site.source_repo} (Fresh/Deno) para TanStack Start e publicar o resultado em ${site.target_repo}.

# Passos
1. Se /app/source ainda não existe: \`git clone --depth 1 -b ${site.source_branch} ${sourceUrl} /app/source\` (cópia pristina do site original — NUNCA modifique).
2. O repo alvo JÁ está clonado pelo sandbox em /app/repo (origin = ${targetUrl}) — trabalhe NELE. Copie o conteúdo do original pra dentro: \`cd /app/repo && rsync -a --exclude .git /app/source/ .\`.
3. Em /app/repo: \`npm install @decocms/start tsx\` e rode o script de migração: \`npx tsx node_modules/@decocms/start/scripts/migrate.ts --source /app/source\`. Ele roda 7 fases (analyze, scaffold, transform, cleanup, report, verify, bootstrap). Se o repo já tiver MIGRATION_REPORT.md de uma execução anterior, pule esta etapa.
4. Corrija erros até \`npx tsc --noEmit\` e \`npm run build\` passarem. Regra de ouro: NUNCA reescreva componentes — porte o original de /app/source com mudanças mecânicas (imports preact→react, class→className, signals→estado react). Consulte /app/source sempre que precisar do comportamento original.
5. Commit e push: \`git add -A && git commit -m "feat: initial tanstack migration" && git push -u -f origin main\` (o repo alvo é gerenciado pela migração e acabou de ser criado — o force do push inicial é seguro e sobrescreve qualquer README/commit inicial).
6. Suba o dev server em background na porta 3000: \`nohup bun run dev > /tmp/dev.log 2>&1 &\` (em /app/repo) e confirme que responde 200 em http://localhost:3000. O daemon do sandbox também detecta o package.json e passa a gerenciar o dev server nos próximos restarts.
${gitAuthNote(ghToken)}
${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato:
RESULT_JSON: {"ok": true, "detail": "migração inicial concluída, build verde, dev server de pé"}
(ok=false com detail explicando o bloqueio se não conseguir terminar)`;
}

export function fixIterationPrompt(input: {
  site: SiteRow;
  iteration: number;
  ghToken?: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  artifacts?: ParityArtifactUrls;
  previousIssues?: string[];
}): string {
  const { site, iteration, ghToken, artifacts } = input;
  const targetUrl = repoUrl(site.target_repo, ghToken);
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

  return `Você é o agente de validação de paridade da migração ${site.source_repo} → ${site.target_repo} (iteração ${iteration}). Trabalhe dentro do sandbox usando as tools de vm (bash, read, write). Não peça confirmação.

# Contexto
- Código migrado em /app/repo (original pristino em /app/source — use como referência, nunca modifique).
- Dev server deve estar de pé na porta 3000; se não estiver: \`cd /app/repo && nohup bun run dev > /tmp/dev.log 2>&1 &\` e aguarde responder.
- Produção (referência visual/funcional): ${site.prod_url}

# Passos
1. Rode a parity CLI comparando produção vs candidato:
   \`cd /app/repo && ${parityEnv} npx -y @decocms/parity run --prod ${site.prod_url} --cand http://localhost:3000 --preset ci\`
2. Localize o diretório do run: \`RUN_DIR=$(ls -td parity-output/runs/*/ | head -1)\` e leia $RUN_DIR/report.json.
${uploadSteps.length > 0 ? `3. Faça upload dos artefatos:\n${uploadSteps.map((s) => `   ${s}`).join("\n")}` : "3. (sem upload de artefatos configurado)"}
4. Extraia verdict.score do report.json. Se score >= ${site.parity_target}, NÃO mexa em mais nada — vá direto para o RESULT_JSON.
5. Caso contrário, corrija os topIssues mais graves (componentes/seções faltando em sectionsOnlyInProd, hydration mismatch, erros de console, fluxo de compra). Porte sempre do original em /app/source. Depois: \`git add -A && git commit -m "fix(parity): iteration ${iteration}" && git push origin main\` (remote: ${targetUrl}) e reinicie o dev server.${gitAuthNote(ghToken)}
${input.previousIssues?.length ? `\n# Issues em aberto da iteração anterior\n${input.previousIssues.map((i) => `- ${i}`).join("\n")}` : ""}

${progressInstruction(site)}

# Resultado
Termine sua ÚLTIMA mensagem com uma linha exatamente neste formato:
RESULT_JSON: {"ok": true, "parityScore": <verdict.score do report.json>, "detail": "<resumo do que corrigiu>"}
(ok=false apenas se a parity CLI nem conseguiu rodar)`;
}
