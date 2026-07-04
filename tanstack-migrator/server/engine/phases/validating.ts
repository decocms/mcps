/**
 * Phase: validating — the parity loop. Each pass = one bounded session:
 * run @decocms/parity (prod vs sandbox preview), upload artifacts to object
 * storage via pre-minted presigned PUTs, fix the top issues, push, repeat.
 *
 * Stops when parity_score >= parity_target (→ deploying_cf) or when
 * iterations run out / stop improving (→ needs_human).
 */

import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import {
  isValidatingStatus,
  type ParitySummary,
  type SiteRow,
} from "../../db/types.ts";
import {
  artifactKeys,
  fetchReportSummary,
  presignPutUrls,
} from "../../lib/artifacts.ts";
import { ghsTokenForSite } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { fixIterationPrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";

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

export async function validating(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  // Terminal checks first (idempotent re-entry)
  const target = site.parity_target;
  if (site.parity_score !== null && site.parity_score >= target) {
    await updateSite(site.id, {
      status: "deploying_cf",
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
      resume_status: "validating",
      needs_human_reason: `Loop de paridade esgotou ${site.max_iterations} iterações (melhor score: ${site.best_score ?? "n/a"}).`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      "Máximo de iterações atingido — precisa de humano",
      "warn",
    );
    return;
  }
  if (site.no_improve_count >= site.no_improve_limit) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "validating",
      needs_human_reason: `${site.no_improve_count} iterações sem melhora de score (melhor: ${site.best_score ?? "n/a"}).`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "Score estagnou — precisa de humano", "warn");
    return;
  }

  if (deps.inflight.has(site.id)) return;
  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return;

  const iteration = site.iterations_done + 1;
  const run = await createRun({
    siteId: site.id,
    kind: "fix_iteration",
    iteration,
  });
  await markSessionStart(site.id, `parity-${iteration}`);
  await addEvent(site.id, `Iteração de paridade ${iteration} iniciada`);

  deps.inflight.start(site.id, `parity-${iteration}`, async () => {
    const keys = artifactKeys(site.id, run.id);
    try {
      let result;
      let summary: ParitySummary | null = null;

      if (isSimulation(ctx)) {
        result = await getDriver(ctx).runTask(site, ctx, {
          kind: "fix_iteration",
          prompt: "",
          iteration,
        });
        summary =
          result.parityScore !== undefined
            ? simulatedSummary(result.parityScore)
            : null;
      } else {
        const artifacts = await presignPutUrls(ctx, keys);
        const { token, grant } = await ghsTokenForSite(ctx, site);
        if (grant?.refreshToken) {
          await updateSite(site.id, {
            gh_refresh_token: grant.refreshToken,
            gh_token_endpoint: grant.tokenEndpoint ?? null,
            gh_client_id: grant.clientId ?? null,
          });
        }
        const previousIssues = (
          await getSite(site.id)
        )?.needs_human_reason?.split("\n");

        result = await getDriver(ctx).runTask(site, ctx, {
          kind: "fix_iteration",
          iteration,
          runId: run.id,
          prompt: fixIterationPrompt({
            site,
            iteration,
            ghToken: token,
            anthropicApiKey: ctx.config.anthropicApiKey,
            openrouterApiKey: ctx.config.openrouterApiKey,
            artifacts: artifacts ?? undefined,
            previousIssues,
          }),
        });
        summary = await fetchReportSummary(ctx, keys.prefix);
      }

      const current = await getSite(site.id);
      if (!current || !isValidatingStatus(current.status)) return;

      if (!result.ok) {
        await finishRun(run.id, { status: "failed", logsTail: result.output });
        await updateSite(site.id, {
          status: "needs_human",
          resume_status: "validating",
          needs_human_reason: `Iteração ${iteration} não conseguiu rodar a parity CLI: ${result.error}`,
          sandbox_session_id: null,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `Iteração ${iteration} falhou: ${result.error}`,
          "error",
        );
        return;
      }

      const score = result.parityScore ?? summary?.verdict?.score ?? null;
      const best = current.best_score ?? 0;
      const improved = score !== null && score > best;

      await finishRun(run.id, {
        status: "succeeded",
        parityScore: score ?? undefined,
        summary: summary ?? undefined,
        artifactPrefix: keys.prefix,
        logsTail: result.output,
      });

      await updateSite(site.id, {
        parity_score: score,
        best_score: improved ? score : current.best_score,
        iterations_done: iteration,
        no_improve_count: improved ? 0 : current.no_improve_count + 1,
        sandbox_session_id: null,
        phase_detail: `iteração ${iteration}: score ${score ?? "?"}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Iteração ${iteration} concluída — score ${score ?? "desconhecido"}%`,
      );
      // the next tick re-enters this phase and decides: done / next iteration / needs_human
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      await updateSite(site.id, {
        status: "needs_human",
        resume_status: "validating",
        needs_human_reason: `Iteração ${iteration} quebrou: ${message}`,
        sandbox_session_id: null,
      });
      await addEvent(
        site.id,
        `Iteração ${iteration} quebrou: ${message}`,
        "error",
      );
    }
  });
}
