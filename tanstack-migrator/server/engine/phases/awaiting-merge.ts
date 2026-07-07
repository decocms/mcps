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
    await finishAsDone(site, "[simulation] PR merged — migration done");
    return;
  }

  // No PR registered: never auto-declare go-live — a human confirms.
  if (!site.pr_number || !site.target_repo) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "awaiting_merge",
      needs_human_reason: `Parity reached but no PR is registered for ${site.target_repo ?? site.name}. Confirm the state of branch ${site.work_branch} on GitHub and finish with SITE_MARK_DONE (or Retry after opening the PR manually).`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      "awaiting_merge without a registered PR — needs human",
      "warn",
    );
    return;
  }

  // read failures must not fail a passive polling state — warn and retry
  let pr: Awaited<ReturnType<typeof getPullRequest>>;
  try {
    pr = await getPullRequest(ctx, parseRepo(site.target_repo), site.pr_number);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addEvent(
      site.id,
      `Poll of PR #${site.pr_number} failed (${message.slice(0, 120)}) — retrying on the next tick`,
      "warn",
    );
    return;
  }
  if (!pr) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "awaiting_merge",
      needs_human_reason: `PR #${site.pr_number} not found in ${site.target_repo}. Check ${site.pr_url ?? "the repo"} and use Retry.`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `PR #${site.pr_number} disappeared from the repo`,
      "warn",
    );
    return;
  }

  if (pr.merged) {
    await finishAsDone(
      site,
      `PR #${site.pr_number} merged — site 100% TanStack`,
    );
    return;
  }
  if (pr.state === "closed") {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "awaiting_merge",
      needs_human_reason: `PR #${site.pr_number} was CLOSED without merging. Reopen and merge it (${site.pr_url ?? ""}) or finish manually with SITE_MARK_DONE.`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `PR #${site.pr_number} closed without merging — needs human`,
      "warn",
    );
    return;
  }

  // still open — keep the timestamp honest so the drawer shows fresh state
  await updateSite(site.id, {
    phase_detail: `awaiting merge of PR #${site.pr_number} (CF deploy happens on merge)`,
    last_progress_at: new Date().toISOString(),
  });
}
