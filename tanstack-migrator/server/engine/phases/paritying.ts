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
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { parityOnlyPrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

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
    await updateSite(site.id, {
      status: "deploying",
      phase_detail: `paridade ${site.parity_score} >= ${target}, indo pro deploy`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Paridade atingiu ${site.parity_score}% — deploy CF`,
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
      await updateSite(site.id, {
        parity_score: score,
        best_score: improved ? score : current.best_score,
        iterations_done: iteration,
        no_improve_count: improved ? 0 : current.no_improve_count + 1,
        sandbox_session_id: null,
        phase_thread_id: null,
        transient_retries: 0,
        status: hitTarget ? "deploying" : "fixing",
        phase_detail: `rodada ${iteration}: score ${score ?? "?"}${hitTarget ? " — meta atingida!" : ` (${createdCount} issues novas)`}`,
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
