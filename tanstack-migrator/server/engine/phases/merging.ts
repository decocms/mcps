/**
 * Phase: merging — MCP-side (no session). Auto-merges the reviewed PR:
 *   1. squash-merge the PR into main (idempotent: an already-merged PR passes)
 *   2. delete the round branch (best-effort)
 *   3. advance to deploying (which deploys main and routes to triaging on the
 *      first deploy, else paritying)
 * A merge conflict (main advanced under us) routes to needs_human(resume=fixing).
 */

import { addEvent } from "../../db/events.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import {
  deleteBranch,
  getPullRequest,
  mergePullRequest,
  MergeConflictError,
  parseRepo,
} from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { isSimulation } from "../../sandbox/client.ts";

async function advanceToDeploy(site: SiteRow, note: string): Promise<void> {
  await updateSite(site.id, {
    status: "deploying",
    pr_number: null,
    pr_url: null,
    phase_detail: note,
    last_progress_at: new Date().toISOString(),
  });
}

export async function merging(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (isSimulation(ctx)) {
    await advanceToDeploy(site, "[simulation] PR merged — deploying");
    await addEvent(site.id, "[simulation] PR merged (squash) — deploying");
    return;
  }

  if (!site.target_repo) throw new Error("target_repo not set");
  const ref = parseRepo(site.target_repo);

  if (!site.pr_number) {
    // nothing to merge — treat as already done, deploy main
    await advanceToDeploy(site, "no open PR — deploying main");
    return;
  }

  // Read the PR first — idempotent re-entry (a prior tick may have merged it).
  let pr;
  try {
    pr = await getPullRequest(ctx, ref, site.pr_number);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addEvent(
      site.id,
      `Could not read PR #${site.pr_number} (${message.slice(0, 140)}) — retrying next tick`,
      "warn",
    );
    return; // stay in merging, retry
  }

  if (!pr) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "merging",
      needs_human_reason: `PR #${site.pr_number} not found on ${site.target_repo} — merge it manually or retry.`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `PR #${site.pr_number} not found — needs human`,
      "error",
    );
    return;
  }

  try {
    if (!pr.merged) {
      if (pr.mergeableState === "dirty") {
        await updateSite(site.id, {
          status: "needs_human",
          resume_status: "fixing",
          needs_human_reason: `PR #${site.pr_number} has merge conflicts with main — rebase the branch (${site.work_branch}) and retry.`,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `PR #${site.pr_number} has conflicts — needs human (then resume fixing)`,
          "warn",
        );
        return;
      }
      const merged = await mergePullRequest(ctx, ref, site.pr_number, {
        method: "squash",
      });
      await addEvent(
        site.id,
        `PR #${site.pr_number} ${merged.alreadyMerged ? "was already merged" : "merged (squash)"}`,
      );
    } else {
      await addEvent(
        site.id,
        `PR #${site.pr_number} already merged — continuing`,
      );
    }
  } catch (err) {
    if (err instanceof MergeConflictError) {
      await updateSite(site.id, {
        status: "needs_human",
        resume_status: "fixing",
        needs_human_reason: `PR #${site.pr_number} is not mergeable (${err.message}) — resolve conflicts and resume.`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `PR #${site.pr_number} not mergeable — needs human`,
        "warn",
      );
      return;
    }
    throw err; // transient — advanceSite will retry/fail with resume_status=merging
  }

  // best-effort branch cleanup — never block the pipeline
  try {
    await deleteBranch(ctx, ref, site.work_branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addEvent(
      site.id,
      `branch ${site.work_branch} not deleted (${message.slice(0, 120)})`,
      "warn",
    );
  }

  const current = (await getSite(site.id)) ?? site;
  await advanceToDeploy(
    current,
    `PR #${site.pr_number} merged — deploying main`,
  );
}
