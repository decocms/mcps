/**
 * Phase: deploying_cf — deploy to Cloudflare Workers.
 *
 * Two paths:
 *   - CLOUDFLARE_API_TOKEN set: run `npm run build && wrangler deploy` inside the
 *     sandbox (direct upload — no dashboard, no git integration needed). After deploy,
 *     probe the live URL with previewRendersRealHtml to confirm it works.
 *   - No token: route to needs_human with the one-time dashboard instructions.
 *
 * Simulation always "finishes" so the manual-driver e2e flow completes.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { manualCfInstructions } from "../../lib/cloudflare.ts";
import { parseRepo } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { previewRendersRealHtml } from "../../lib/preview.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { deployPrompt } from "../../sandbox/templates/prompts.ts";

/**
 * After a successful deploy, route on whether this was the FIRST deploy:
 *   - initial migration (no cf_deploy_url yet) → triaging (build the backlog)
 *   - every fix round (cf_deploy_url already set) → paritying (measure vs URL)
 * Robust even when triage found zero issues (doesn't depend on issues_total).
 */
async function advanceAfterDeploy(
  site: SiteRow,
  patch: Partial<SiteRow>,
): Promise<void> {
  const firstDeploy = !site.cf_deploy_url;
  const next = firstDeploy ? "triaging" : "paritying";
  await updateSite(site.id, {
    ...patch,
    status: next,
    phase_detail: firstDeploy
      ? "deploy ok — triaging the migrated site"
      : "deploy ok — measuring parity against the real URL",
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `CF deploy ok at ${patch.cf_deploy_url ?? site.cf_deploy_url ?? "?"} — ${firstDeploy ? "triaging" : "advancing to parity"}`,
  );
}

export async function deployingCf(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (!site.target_repo) throw new Error("target_repo not set");
  const workerName = parseRepo(site.target_repo).repo;

  if (isSimulation(ctx)) {
    await advanceAfterDeploy(site, {
      cf_project_name: workerName,
      cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
    });
    return;
  }

  const cfToken = ctx.config.cloudflareApiToken;
  if (!cfToken) {
    // No token: show one-time dashboard instructions and park.
    const prNote = site.pr_number
      ? ` Once connected, PR #${site.pr_number} gets a preview deploy; merging into main triggers the go-live.`
      : "";
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "deploying",
      cf_project_name: workerName,
      cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
      needs_human_reason:
        manualCfInstructions({ workerName, repoFull: site.target_repo }) +
        prNote +
        " Alternative: set CLOUDFLARE_API_TOKEN in the MCP for automatic deploy.",
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `CF deploy: no CLOUDFLARE_API_TOKEN — set the token for automatic deploy or follow the dashboard instructions.`,
      "warn",
    );
    try {
      await getDriver(ctx).destroy(site, ctx);
    } catch {
      // idle TTL will reap it anyway
    }
    return;
  }

  // Automated path: run `npm run build && wrangler deploy` inside the sandbox.
  await addEvent(site.id, "Starting automatic deploy to Cloudflare Workers...");
  await updateSite(site.id, {
    phase_detail: "building and deploying to Cloudflare Workers...",
    last_progress_at: new Date().toISOString(),
  });

  const run = await createRun({ siteId: site.id, kind: "migrate" });

  try {
    const result = await getDriver(ctx).runTask(site, ctx, {
      kind: "deploy",
      prompt: deployPrompt({ site, cfApiToken: cfToken }),
      runId: run.id,
      timeoutMs: SESSION_TIMEOUT_MS.migrate,
    });

    const current = await getSite(site.id);
    if (!current || current.status !== "deploying") {
      await finishRun(run.id, {
        status: "failed",
        logsTail: `[abandoned: site left deploying during the session]`,
        meta: result.meta,
      });
      return;
    }

    // Extract the deployed URL from wrangler stdout or the RESULT_JSON line.
    const urlMatch = result.output.match(
      /https:\/\/[\w-]+\.[\w-]+\.workers\.dev/,
    );
    const deployUrl = urlMatch
      ? urlMatch[0]
      : `https://${workerName}.deco-cx.workers.dev`;

    if (result.ok) {
      await finishRun(run.id, {
        status: "succeeded",
        logsTail: result.output,
        meta: result.meta,
      });

      // Probe the live URL — this is the real verification (no sandbox proxy).
      const rendersReal = await previewRendersRealHtml(deployUrl, 15_000);
      if (rendersReal) {
        await addEvent(
          site.id,
          `CF deploy ok + real HTML confirmed at ${deployUrl}`,
        );
      } else {
        await addEvent(
          site.id,
          `CF deploy ok but ${deployUrl} does not serve real HTML yet (may be warming up — try again in 1 min)`,
          "warn",
        );
      }

      await advanceAfterDeploy(current, {
        cf_project_name: workerName,
        cf_deploy_url: deployUrl,
      });
    } else {
      await finishRun(run.id, {
        status: "failed",
        logsTail: result.output,
        meta: result.meta,
      });
      await updateSite(current.id, {
        status: "needs_human",
        resume_status: "deploying",
        needs_human_reason: `wrangler deploy failed: ${result.error ?? result.output.slice(-300)}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(current.id, `CF deploy failed — check the logs`, "error");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, { status: "failed", logsTail: message });
    const current = await getSite(site.id);
    if (current) {
      await updateSite(current.id, {
        status: "needs_human",
        resume_status: "deploying",
        needs_human_reason: `Error in CF deploy: ${message}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(current.id, `Error in CF deploy: ${message}`, "error");
    }
  }
}
