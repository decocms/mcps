/**
 * Phase: deploying_cf — create the Cloudflare Workers Builds project
 * (git-connected, watching MAIN: the deploy happens when the PR merges).
 * With a PR registered the site parks in awaiting_merge (human merge =
 * go-live); without one it finishes directly. Degrades to needs_human with
 * manual instructions when the API/token isn't available.
 */

import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import {
  createWorkersBuildsProject,
  manualCfInstructions,
} from "../../lib/cloudflare.ts";
import { parseRepo } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";

async function finishMigration(
  site: SiteRow,
  ctx: WorkerCtx,
  patch: Partial<SiteRow>,
): Promise<void> {
  const hasPr = Boolean(site.pr_number);
  if (hasPr) {
    await updateSite(site.id, {
      ...patch,
      status: "awaiting_merge",
      phase_detail: `projeto CF criado — aguardando merge do PR #${site.pr_number} (merge = go-live)`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Paridade ok e CF configurada — falta só o merge do PR #${site.pr_number}`,
    );
  } else {
    await updateSite(site.id, {
      ...patch,
      status: "done",
      phase_detail: "migração concluída",
      finished_at: new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "Migração concluída 🎉");
  }
  try {
    await getDriver(ctx).destroy(site, ctx);
  } catch {
    // idle TTL will reap it anyway
  }
}

export async function deployingCf(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (!site.target_repo) throw new Error("target_repo not set");
  const workerName = parseRepo(site.target_repo).repo;

  if (isSimulation(ctx)) {
    await finishMigration(site, ctx, {
      cf_project_name: workerName,
      cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
    });
    return;
  }

  if (!ctx.config.cloudflareApiToken) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "deploying",
      needs_human_reason: manualCfInstructions({
        workerName,
        repoFull: site.target_repo,
      }),
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      "Sem CLOUDFLARE_API_TOKEN — criação do projeto CF é manual",
      "warn",
    );
    return;
  }

  const run = await createRun({ siteId: site.id, kind: "deploy_cf" });
  try {
    const project = await createWorkersBuildsProject(ctx, {
      workerName,
      repoFull: site.target_repo,
    });
    await finishRun(run.id, { status: "succeeded" });
    await addEvent(site.id, `Projeto CF criado: ${project.projectName}`);
    await finishMigration(site, ctx, {
      cf_project_name: project.projectName,
      cf_deploy_url: project.deployUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, { status: "failed", logsTail: message });
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "deploying",
      needs_human_reason: `${message}\n\n${manualCfInstructions({ workerName, repoFull: site.target_repo })}`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `API da CF recusou (${message}) — criação manual`,
      "warn",
    );
  }
}
