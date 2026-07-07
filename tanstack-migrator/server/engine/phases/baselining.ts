/**
 * Phase: baselining — capture a Lighthouse/SEO snapshot of the production site
 * BEFORE the migration starts, running @decocms/parity with --prod == --cand.
 *
 * Failure is SOFT: any error is logged and the site advances to migrating_script
 * without blocking the pipeline. The baseline is best-effort.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";

const BASELINE_TIMEOUT_MS = SESSION_TIMEOUT_MS["parity"] ?? 20 * 60_000;
import { addEvent } from "../../db/events.ts";
import { getSiteCost, refreshCostSnapshotIfStale } from "../../db/cost.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { incrementCost, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import {
  artifactKeys,
  fetchReportSummary,
  presignPutUrls,
} from "../../lib/artifacts.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { baselinePrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { markSessionStart } from "./session-guard.ts";

async function advanceToMigrating(site: SiteRow): Promise<void> {
  await updateSite(site.id, {
    status: "migrating_script",
    phase_detail: "baseline capturado — rodando o script de migração",
    last_progress_at: new Date().toISOString(),
  });
}

export async function baselining(
  site: SiteRow,
  ctx: WorkerCtx,
  _deps: EngineDeps,
): Promise<void> {
  // Capture pre-migration infra cost (COGS "antes"), best-effort — needs the
  // Grafana binding + a populated cost snapshot; no-op otherwise.
  if (site.cost_before_usd == null) {
    try {
      await refreshCostSnapshotIfStale(ctx, site.connection_id);
      const before = await getSiteCost(site.connection_id, site.name);
      if (before != null) {
        await updateSite(site.id, {
          cost_before_usd: before,
          cost_before_at: new Date().toISOString(),
        });
      }
    } catch {
      // best-effort — never block the baseline on cost capture
    }
  }

  // Idempotent: already measured — skip straight to migrating_script
  if (site.baseline_measured_at) {
    await advanceToMigrating(site);
    return;
  }

  if (isSimulation(ctx)) {
    await updateSite(site.id, {
      baseline_score: 100,
      baseline_measured_at: new Date().toISOString(),
      baseline_verdict: {
        verdict: { status: "pass", score: 100 },
        parityOk: true,
        perPage: [{ pagePath: "/", verdict: "pass", pctDiff: 0 }],
      },
    });
    await advanceToMigrating(site);
    return;
  }

  const driver = getDriver(ctx);
  const run = await createRun({
    siteId: site.id,
    kind: "migrate",
    iteration: 0,
  });

  await markSessionStart(site.id, "baselining");
  await addEvent(
    site.id,
    "Baseline: capturando snapshot Lighthouse/SEO do site original",
  );

  try {
    const keys = artifactKeys(site.id, run.id);
    const signed = await presignPutUrls(ctx, keys);

    const prompt = baselinePrompt({
      site,
      putUrls: {
        reportJson: signed?.reportJsonPut,
        reportHtml: signed?.reportHtmlPut,
      },
    });

    const result = await driver.runTask(site, ctx, {
      kind: "baseline",
      prompt,
      runId: run.id,
      timeoutMs: BASELINE_TIMEOUT_MS,
    });

    await finishRun(run.id, {
      status: result.ok ? "succeeded" : "failed",
      logsTail: result.output,
      meta: result.meta,
    });

    if (result.meta?.usage?.costUsd) {
      await incrementCost(site.id, result.meta.usage.costUsd);
    }

    if (result.ok) {
      const summary = await fetchReportSummary(ctx, keys.prefix);

      await updateSite(site.id, {
        baseline_score: result.parityScore ?? 100,
        baseline_measured_at: new Date().toISOString(),
        baseline_report_prefix: keys.prefix,
        baseline_verdict: summary ?? null,
      });
      await addEvent(
        site.id,
        `Baseline capturado — score ${result.parityScore ?? 100}%`,
      );
    } else {
      await addEvent(
        site.id,
        `Baseline falhou (não bloqueia pipeline): ${result.error ?? result.output.slice(-200)}`,
        "warn",
      );
    }
  } catch (err) {
    await addEvent(
      site.id,
      `Baseline erro (não bloqueia pipeline): ${String(err).slice(0, 300)}`,
      "warn",
    );
  }

  await advanceToMigrating(site);
}
