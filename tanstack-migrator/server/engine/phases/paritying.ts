/**
 * Phase: paritying — ONE measure-only session runs @decocms/parity (prod vs
 * sandbox dev server), uploads artifacts via presigned PUTs and reports the
 * score. The MCP turns the report's topIssues into GitHub issues (deduped
 * via the tsm marker, heatmap + report link embedded) and routes back to
 * fixing — or to deploying_cf when the target is hit.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, incrementCost, updateSite } from "../../db/sites.ts";
import type { ParitySummary, SiteRow } from "../../db/types.ts";
import {
  artifactKeys,
  fetchReportSummary,
  presignIssueEmbeds,
  presignPutUrls,
} from "../../lib/artifacts.ts";
import {
  paritySummaryToDrafts,
  refreshIssueCounts,
  syncIssuesFromDrafts,
} from "../../lib/issues.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { previewRendersRealHtml } from "../../lib/preview.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import {
  type IssueDraft,
  parityOnlyPrompt,
} from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

// The synthetic issue filed when the pipeline reaches parity with a candidate
// that doesn't render — deduped by title across rounds so it never spams.
const PREVIEW_BROKEN_DRAFT: IssueDraft = {
  title: "[runtime] preview não renderiza HTML real em /",
  body: [
    "## Contexto",
    "O backlog de issues drenou mas o preview do sandbox NÃO renderiza HTML de verdade — a paridade não pode medir contra um placeholder/shell vazio.",
    "## Erro",
    'Um GET em `/` devolve o placeholder "No web page at this URL" ou um shell vazio (`<div id="root"></div>` sem conteúdo renderizado).',
    "## Como reproduzir",
    "Garanta o dev de pé (bloco Setup) e `curl -sL http://localhost:$DEV_PORT/ | head -120`.",
    "## Dica de fix",
    'SSR quebrado. Causas comuns: (1) section loader estoura por `ctx` undefined → torne `ctx?: AppContext` opcional + optional-chaining em todo acesso; (2) global client-only no render do server (`window`/`document`/`globalThis.location`) → guardar com `typeof window !== "undefined"`; (3) generates faltando → `bun run predev`. Leia `tail -80 /tmp/dev.log` pelo stack e corrija o arquivo:linha.',
  ].join("\n"),
  severity: "high",
  category: "runtime",
  page: "/",
};

/**
 * Parity is meaningless against a candidate that doesn't render — measuring a
 * placeholder/empty shell just burns a session and reports a garbage score.
 * Gate the phase on a LIVE preview probe (independent of the issue backlog,
 * which triage/fix may have drained without ever fixing the actual SSR). If the
 * preview is broken, file a deduped SSR issue and bounce back to fixing — or
 * escalate to needs_human when the fix budget is spent. Returns true when it's
 * safe to proceed with the parity measurement.
 */
/**
 * Gate parity on the CF deploy URL rendering real HTML. If the CF worker is
 * broken, park in needs_human (re-deploy needed, not a code fix).
 */
async function previewGate(site: SiteRow, ctx: WorkerCtx): Promise<boolean> {
  if (isSimulation(ctx)) return true;
  // Parity now runs against the CF URL (deploy comes before parity).
  const cfUrl = site.cf_deploy_url;
  if (!cfUrl) return true; // no URL yet — don't deadlock
  if (await previewRendersRealHtml(cfUrl, 15_000)) return true;

  await updateSite(site.id, {
    status: "needs_human",
    resume_status: "deploying",
    needs_human_reason: `A URL do CF worker não renderiza HTML real (deploy pode estar quebrado): ${cfUrl}. Re-faça o deploy (SITE_RETRY fromStatus=deploying) e tente novamente.`,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `CF worker ${cfUrl} não renderiza HTML — precisa de re-deploy`,
    "error",
  );
  return false;
}

function simulatedSummary(score: number): ParitySummary {
  return {
    verdict: { status: score >= 95 ? "pass" : "warn", score },
    parityOk: score >= 95,
    topIssues:
      score >= 95
        ? []
        : [
            {
              severity: "high",
              category: "visual",
              page: "/",
              summary: "[simulação] Hero banner divergente no mobile",
            },
          ],
    perPage: [
      {
        pagePath: "/",
        viewport: "mobile",
        pctDiff: Math.max(0, 100 - score) / 10,
      },
    ],
  };
}

export async function paritying(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  // Terminal checks first (idempotent re-entry)
  const target = site.parity_target;
  if (site.parity_score !== null && site.parity_score >= target) {
    const hasPr = Boolean(site.pr_number);
    await updateSite(site.id, {
      status: hasPr ? "awaiting_merge" : "done",
      phase_detail: hasPr
        ? `paridade ${site.parity_score}% ✓ — aguardando merge do PR #${site.pr_number}`
        : `paridade ${site.parity_score}% ✓ — migração concluída`,
      finished_at: hasPr ? undefined : new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      hasPr
        ? `Paridade ${site.parity_score}% — falta o merge do PR #${site.pr_number}`
        : `Paridade ${site.parity_score}% — migração concluída 🎉`,
    );
    return;
  }
  if (site.iterations_done >= site.max_iterations) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "paritying",
      needs_human_reason: `Loop de paridade esgotou ${site.max_iterations} rodadas (melhor score: ${site.best_score ?? "n/a"}). Issues abertas: https://github.com/${site.target_repo}/issues?q=is%3Aissue+is%3Aopen+label%3Atanstack-migrator`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      "Máximo de rodadas de paridade atingido — precisa de humano",
      "warn",
    );
    return;
  }
  if (site.no_improve_count >= site.no_improve_limit) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "paritying",
      needs_human_reason: `${site.no_improve_count} rodadas sem melhora de score (melhor: ${site.best_score ?? "n/a"}).`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "Score estagnou — precisa de humano", "warn");
    return;
  }

  if (deps.inflight.has(site.id)) return;

  // Never measure parity against a candidate that doesn't render — bounces back
  // to fixing (with a synthetic SSR issue) or needs_human if the budget's spent.
  if (!(await previewGate(site, ctx))) return;

  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return;

  const iteration = site.iterations_done + 1;
  const run = await createRun({ siteId: site.id, kind: "parity", iteration });
  await markSessionStart(site.id, `parity-${iteration}`);
  await addEvent(
    site.id,
    `Rodada de paridade ${iteration} iniciada (somente medição)`,
  );

  deps.inflight.start(site.id, `parity-${iteration}`, async () => {
    const keys = artifactKeys(site.id, run.id);
    try {
      let result;
      let summary: ParitySummary | null = null;

      if (isSimulation(ctx)) {
        result = await getDriver(ctx).runTask(site, ctx, {
          kind: "parity",
          prompt: "",
          iteration,
        });
        summary =
          result.parityScore !== undefined
            ? simulatedSummary(result.parityScore)
            : null;
      } else {
        // object storage is optional — skip artifacts gracefully
        const artifacts = await presignPutUrls(ctx, keys).catch(() => null);
        result = await getDriver(ctx).runTask(site, ctx, {
          kind: "parity",
          iteration,
          runId: run.id,
          threadId: site.phase_thread_id ?? undefined,
          timeoutMs: SESSION_TIMEOUT_MS.parity,
          prompt: parityOnlyPrompt({
            site,
            anthropicApiKey: ctx.config.anthropicApiKey,
            openrouterApiKey: ctx.config.openrouterApiKey,
            artifacts: artifacts ?? undefined,
          }),
        });
        summary = await fetchReportSummary(ctx, keys.prefix);
      }
      await incrementCost(site.id, result.meta?.usage?.costUsd);

      const current = await getSite(site.id);
      if (!current || current.status !== "paritying") {
        // site paused/changed mid-session — close the run row so the
        // history never shows a phantom "running" entry
        await finishRun(run.id, {
          status: "failed",
          logsTail: `[abandonada: site saiu de paritying durante a sessão]`,
          meta: result.meta,
        });
        return;
      }

      if (!result.ok) {
        await finishRun(run.id, {
          status: "failed",
          logsTail: result.output,
          meta: result.meta,
        });
        await failOrAutoRetry(
          current,
          result.error ?? "medição de paridade falhou",
          "paritying",
          "Medição de paridade falhou",
        );
        return;
      }

      const score = result.parityScore ?? summary?.verdict?.score ?? null;
      const best = current.best_score ?? 0;
      const improved = score !== null && score > best;

      // Report issues → GitHub backlog (deduped; skips when target was hit)
      let createdCount = 0;
      if (!isSimulation(ctx) && summary && (score === null || score < target)) {
        const embeds = await presignIssueEmbeds(ctx, keys.prefix);
        const drafts = paritySummaryToDrafts(summary, embeds);
        const sync = await syncIssuesFromDrafts(
          ctx,
          current,
          drafts,
          "parity",
          ctx.config.maxIssuesPerTriage,
        );
        createdCount = sync.created.length;
        await refreshIssueCounts(ctx, current);
      }

      await finishRun(run.id, {
        status: "succeeded",
        parityScore: score ?? undefined,
        summary: summary ?? undefined,
        artifactPrefix: keys.prefix,
        logsTail: result.output,
        meta: { ...result.meta, issues: { created: createdCount } },
      });

      const hitTarget = score !== null && score >= target;
      const hasPr = Boolean(current.pr_number);
      await updateSite(site.id, {
        parity_score: score,
        best_score: improved ? score : current.best_score,
        iterations_done: iteration,
        no_improve_count: improved ? 0 : current.no_improve_count + 1,
        sandbox_session_id: null,
        phase_thread_id: null,
        transient_retries: 0,
        status: hitTarget ? (hasPr ? "awaiting_merge" : "done") : "fixing",
        phase_detail: `rodada ${iteration}: score ${score ?? "?"}${hitTarget ? " — meta atingida!" : ` (${createdCount} issues novas)`}`,
        finished_at: hitTarget && !hasPr ? new Date().toISOString() : undefined,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Rodada de paridade ${iteration} — score ${score ?? "desconhecido"}%${createdCount > 0 ? ` · ${createdCount} issues novas` : ""}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) {
        await failOrAutoRetry(
          current,
          message,
          "paritying",
          "Medição de paridade falhou",
        );
      }
    }
  });
}
