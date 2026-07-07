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
  title: "[runtime] preview does not render real HTML at /",
  body: [
    "## Context",
    "The issue backlog drained but the sandbox preview does NOT render real HTML — parity cannot measure against a placeholder/empty shell.",
    "## Error",
    'A GET on `/` returns the "No web page at this URL" placeholder or an empty shell (`<div id="root"></div>` with no rendered content).',
    "## How to reproduce",
    "Make sure the dev server is up (Setup block) and `curl -sL http://localhost:$DEV_PORT/ | head -120`.",
    "## Fix hint",
    'Broken SSR. Common causes: (1) section loader throws on undefined `ctx` → make `ctx?: AppContext` optional + optional-chaining on every access; (2) client-only global in the server render (`window`/`document`/`globalThis.location`) → guard with `typeof window !== "undefined"`; (3) missing generates → `bun run predev`. Read `tail -80 /tmp/dev.log` for the stack and fix the file:line.',
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
    needs_human_reason: `The CF worker URL does not render real HTML (deploy may be broken): ${cfUrl}. Re-run the deploy (SITE_RETRY fromStatus=deploying) and try again.`,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `CF worker ${cfUrl} does not render HTML — needs a re-deploy`,
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
              summary: "[simulation] Hero banner mismatch on mobile",
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
  // Terminal checks first (idempotent re-entry). Parity is measured AFTER the
  // per-round merge+deploy, so a PR is never open here. Target met:
  //   - backlog empty → done
  //   - backlog non-empty → keep draining in fixing (no wasted parity session,
  //     which also avoids a false no_improve strike while the score holds)
  const target = site.parity_target;
  if (site.parity_score !== null && site.parity_score >= target) {
    const done = site.issues_open === 0;
    await updateSite(site.id, {
      status: done ? "done" : "fixing",
      phase_detail: done
        ? `parity ${site.parity_score}% ✓ — migration done`
        : `parity ${site.parity_score}% ✓ — draining ${site.issues_open} open issues`,
      finished_at: done ? new Date().toISOString() : undefined,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      done
        ? `Parity ${site.parity_score}% — migration done 🎉`
        : `Parity ${site.parity_score}% reached — draining ${site.issues_open} remaining issues`,
    );
    return;
  }
  if (site.iterations_done >= site.max_iterations) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "paritying",
      needs_human_reason: `Parity loop exhausted ${site.max_iterations} rounds (best score: ${site.best_score ?? "n/a"}). Open issues: https://github.com/${site.target_repo}/issues?q=is%3Aissue+is%3Aopen+label%3Atanstack-migrator`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      "Maximum parity rounds reached — needs human",
      "warn",
    );
    return;
  }
  if (site.no_improve_count >= site.no_improve_limit) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "paritying",
      needs_human_reason: `${site.no_improve_count} rounds without score improvement (best: ${site.best_score ?? "n/a"}).`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "Score stagnated — needs human", "warn");
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
    `Parity round ${iteration} started (measurement only)`,
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
          logsTail: `[abandoned: site left paritying during the session]`,
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
          result.error ?? "parity measurement failed",
          "paritying",
          "Parity measurement failed",
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
      // latest backlog drives the loop-back decision
      const openNow = isSimulation(ctx)
        ? current.issues_open
        : (await refreshIssueCounts(ctx, current)).open;

      // done (target + empty backlog) | fixing (more issues to drain) |
      // re-triage (target missed but backlog empty → find more work)
      const nextStatus: SiteRow["status"] =
        hitTarget && openNow === 0
          ? "done"
          : !hitTarget && openNow === 0
            ? "triaging"
            : "fixing";
      await updateSite(site.id, {
        parity_score: score,
        best_score: improved ? score : current.best_score,
        iterations_done: iteration,
        no_improve_count: improved ? 0 : current.no_improve_count + 1,
        sandbox_session_id: null,
        phase_thread_id: null,
        transient_retries: 0,
        status: nextStatus,
        phase_detail: `round ${iteration}: score ${score ?? "?"}${hitTarget && openNow === 0 ? " — target reached!" : ` (${createdCount} new issues, backlog ${openNow})`}`,
        finished_at:
          nextStatus === "done" ? new Date().toISOString() : undefined,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Parity round ${iteration} — score ${score ?? "unknown"}%${createdCount > 0 ? ` · ${createdCount} new issues` : ""} → ${nextStatus}`,
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
          "Parity measurement failed",
        );
      }
    }
  });
}
