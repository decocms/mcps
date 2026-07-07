/**
 * Phase: reviewing — a code-review agent gates the auto-merge. ONE analyze-only
 * session reviews the diff of the current PR branch vs main and returns
 * approved:true/false in its RESULT_JSON.
 *   - approved       → merging (MCP squash-merges)
 *   - not approved   → persist the blocking problems as issues and go back to
 *                      fixing ON THE SAME branch/PR (no work lost); when the
 *                      fix budget is spent → needs_human.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, incrementCost, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { refreshIssueCounts, syncIssuesFromDrafts } from "../../lib/issues.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { reviewPrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

export async function reviewing(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  if (!site.pr_number) {
    // opening_pr must have set it — nothing to review without a PR
    await updateSite(site.id, {
      status: "opening_pr",
      phase_detail: "no PR to review — reopening",
      last_progress_at: new Date().toISOString(),
    });
    return;
  }

  if (deps.inflight.has(site.id)) return;
  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return;

  const run = await createRun({ siteId: site.id, kind: "review" });
  await markSessionStart(site.id, "review");
  await addEvent(site.id, `Code review of PR #${site.pr_number} started`);

  deps.inflight.start(site.id, "review", async () => {
    try {
      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "review",
        prompt: isSimulation(ctx)
          ? ""
          : reviewPrompt({ site, prNumber: site.pr_number! }),
        runId: run.id,
        threadId: site.phase_thread_id ?? undefined,
        timeoutMs: SESSION_TIMEOUT_MS.review,
      });
      await incrementCost(site.id, result.meta?.usage?.costUsd);

      const current = await getSite(site.id);
      if (!current || current.status !== "reviewing") {
        await finishRun(run.id, {
          status: "failed",
          logsTail: `[abandoned: site left reviewing during the session]`,
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
          result.error ?? "review failed",
          "reviewing",
          "Code review failed",
        );
        return;
      }

      // Simulation always approves so the e2e flow reaches merging.
      const approved = isSimulation(ctx)
        ? true
        : result.parsed?.approved === true;

      if (approved) {
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
          meta: result.meta,
        });
        await updateSite(site.id, {
          status: "merging",
          phase_detail: `review approved PR #${current.pr_number} — merging`,
          sandbox_session_id: null,
          phase_thread_id: null,
          transient_retries: 0,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `Review approved PR #${current.pr_number} — merging`,
        );
        return;
      }

      // Rejected: fold the blocking problems into the backlog and keep fixing
      // on the SAME branch/PR (do NOT reset pr_number — no work is lost).
      const drafts = result.parsed?.issues ?? [];
      if (drafts.length > 0) {
        await syncIssuesFromDrafts(
          ctx,
          current,
          drafts,
          "triage",
          ctx.config.maxIssuesPerTriage,
        );
      }
      const counts = await refreshIssueCounts(ctx, current);
      await finishRun(run.id, {
        status: "succeeded",
        logsTail: result.output,
        meta: { ...result.meta, issues: { created: drafts.length } },
      });

      if (current.fix_sessions_done >= current.max_fix_sessions) {
        await updateSite(site.id, {
          status: "needs_human",
          resume_status: "reviewing",
          needs_human_reason:
            `Code review keeps rejecting PR #${current.pr_number} and the fix budget (${current.max_fix_sessions}) is spent. ${result.parsed?.detail ?? ""}`.slice(
              0,
              500,
            ),
          sandbox_session_id: null,
          phase_thread_id: null,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `Review rejected PR #${current.pr_number} and fix budget is spent — needs human`,
          "warn",
        );
        return;
      }

      await updateSite(site.id, {
        status: "fixing",
        phase_detail: `review requested changes (${drafts.length} issues) — backlog ${counts.open}, back to fixing`,
        sandbox_session_id: null,
        phase_thread_id: null,
        transient_retries: 0,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Review requested changes on PR #${current.pr_number}: ${drafts.length} issues — back to fixing (same branch)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) {
        await failOrAutoRetry(
          current,
          message,
          "reviewing",
          "Code review failed",
        );
      }
    }
  });
}
