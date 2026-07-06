/**
 * Phase: deploying_cf — set up the Cloudflare Workers Builds deploy.
 *
 * The git connection (repo → Workers Builds) is DASHBOARD-ONLY — Cloudflare has
 * no API to connect a repo (CF docs + workers-sdk#12058). So this phase can't
 * automate it: it routes to needs_human with the one-time dashboard steps. Once
 * connected, PRs get preview deploys and main → prod. Simulation still
 * "finishes" so the manual-driver e2e flow completes.
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { manualCfInstructions } from "../../lib/cloudflare.ts";
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

  // Real path: the Workers Builds git connection can't be created via API
  // (dashboard-only). Park in needs_human with the one-time connect steps; the
  // PR preview deploy is where the migrated site first renders.
  const prNote = site.pr_number
    ? ` Depois de conectar, o PR #${site.pr_number} ganha um preview deploy (é onde o site migrado renderiza); o merge em main faz o go-live.`
    : "";
  await updateSite(site.id, {
    status: "needs_human",
    resume_status: "deploying",
    cf_project_name: workerName,
    cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
    needs_human_reason:
      manualCfInstructions({ workerName, repoFull: site.target_repo }) + prNote,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `Deploy CF: conecte o repo no dashboard (1x) — o Workers Builds não tem API pra conectar git.${prNote}`,
    "warn",
  );
  try {
    await getDriver(ctx).destroy(site, ctx);
  } catch {
    // idle TTL will reap it anyway
  }
}
