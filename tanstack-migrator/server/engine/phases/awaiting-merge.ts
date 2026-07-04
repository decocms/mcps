/**
 * Phase: awaiting_merge — parity hit the target and the CF project exists;
 * the human merge of the PR is the go-live (CF watches main). Doesn't hold
 * a queue slot; the worker just polls the PR state each tick.
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { getPullRequest, parseRepo } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { isSimulation } from "../../sandbox/client.ts";

async function finishAsDone(site: SiteRow, detail: string): Promise<void> {
  await updateSite(site.id, {
    status: "done",
    phase_detail: detail,
    finished_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(site.id, `${detail} 🎉`);
}

export async function awaitingMerge(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (isSimulation(ctx)) {
    await finishAsDone(site, "[simulação] PR mergeado — migração concluída");
    return;
  }

  // No PR to wait on (creation failed earlier) — nothing gates the done.
  if (!site.pr_number || !site.target_repo) {
    await finishAsDone(site, "Migração concluída (sem PR registrado)");
    return;
  }

  const pr = await getPullRequest(
    ctx,
    parseRepo(site.target_repo),
    site.pr_number,
  );
  if (!pr) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "awaiting_merge",
      needs_human_reason: `PR #${site.pr_number} não encontrado em ${site.target_repo}. Verifique ${site.pr_url ?? "o repo"} e use Retry.`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, `PR #${site.pr_number} sumiu do repo`, "warn");
    return;
  }

  if (pr.merged) {
    await finishAsDone(
      site,
      `PR #${site.pr_number} mergeado — site 100% TanStack`,
    );
    return;
  }
  if (pr.state === "closed") {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "awaiting_merge",
      needs_human_reason: `PR #${site.pr_number} foi FECHADO sem merge. Reabra e mergeie (${site.pr_url ?? ""}) ou finalize manualmente com SITE_MARK_DONE.`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `PR #${site.pr_number} fechado sem merge — precisa de humano`,
      "warn",
    );
    return;
  }

  // still open — keep the timestamp honest so the drawer shows fresh state
  await updateSite(site.id, {
    phase_detail: `aguardando merge do PR #${site.pr_number} (deploy CF acontece no merge)`,
    last_progress_at: new Date().toISOString(),
  });
}
