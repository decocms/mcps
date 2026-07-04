/**
 * Phase: triaging — ONE analyze-only session surveys the migrated code
 * (tsc, build, routes, dev.log, missing sections) and proposes issues in
 * its RESULT_JSON. The MCP persists them as GitHub issues (deduped via the
 * tsm marker, capped, labeled) — the durable backlog the fixing loop drains.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, incrementCost, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { refreshIssueCounts, syncIssuesFromDrafts } from "../../lib/issues.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { triagePrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

export async function triaging(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  // Idempotent resume: an open backlog means triage already ran — go fix it.
  if (site.issues_open > 0) {
    await updateSite(site.id, {
      status: "fixing",
      phase_detail: `backlog já tem ${site.issues_open} issues abertas`,
      last_progress_at: new Date().toISOString(),
    });
    return;
  }

  if (deps.inflight.has(site.id)) return;
  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return;

  const run = await createRun({ siteId: site.id, kind: "triage" });
  await markSessionStart(site.id, "triage");
  await addEvent(site.id, "Sessão de triagem iniciada (somente análise)");

  deps.inflight.start(site.id, "triage", async () => {
    try {
      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "triage",
        prompt: isSimulation(ctx)
          ? ""
          : triagePrompt({ site, maxIssues: ctx.config.maxIssuesPerTriage }),
        runId: run.id,
        threadId: site.phase_thread_id ?? undefined,
        timeoutMs: SESSION_TIMEOUT_MS.triage,
      });
      await incrementCost(site.id, result.meta?.usage?.costUsd);

      const current = await getSite(site.id);
      if (!current || current.status !== "triaging") return;

      if (!result.ok) {
        await finishRun(run.id, {
          status: "failed",
          logsTail: result.output,
          meta: result.meta,
        });
        await failOrAutoRetry(
          current,
          result.error ?? "triagem falhou",
          "triaging",
          "Triagem falhou",
        );
        return;
      }

      const drafts = result.parsed?.issues ?? [];

      if (isSimulation(ctx)) {
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
          meta: { issues: { created: drafts.length } },
        });
        await updateSite(site.id, {
          status: drafts.length > 0 ? "fixing" : "paritying",
          issues_total: drafts.length,
          issues_open: drafts.length,
          issues_closed: 0,
          phase_detail: `[simulação] triagem: ${drafts.length} issues`,
          sandbox_session_id: null,
          phase_thread_id: null,
          no_improve_count: 0,
          transient_retries: 0,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `[simulação] Triagem: ${drafts.length} issues no backlog`,
        );
        return;
      }

      const sync = await syncIssuesFromDrafts(
        ctx,
        current,
        drafts,
        "triage",
        ctx.config.maxIssuesPerTriage,
      );
      const counts = await refreshIssueCounts(ctx, current);

      await finishRun(run.id, {
        status: "succeeded",
        logsTail: result.output,
        meta: { ...result.meta, issues: { created: sync.created.length } },
      });
      await updateSite(site.id, {
        status: counts.open > 0 ? "fixing" : "paritying",
        phase_detail:
          counts.open > 0
            ? `triagem: ${counts.open} issues abertas, iniciando fixes`
            : "triagem limpa — medindo paridade",
        sandbox_session_id: null,
        phase_thread_id: null,
        no_improve_count: 0,
        transient_retries: 0,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Triagem concluída: ${sync.created.length} issues novas, ${sync.refreshed.length} atualizadas — backlog aberto: ${counts.open}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) {
        await failOrAutoRetry(current, message, "triaging", "Triagem falhou");
      }
    }
  });
}
