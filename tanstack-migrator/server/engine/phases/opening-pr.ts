/**
 * Phase: opening_pr — MCP-side (no session). REUSED by the initial migration
 * and by every fix round:
 *   1. open the PR for the current branch (site.work_branch) → main
 *   2. INITIAL migration only: open the .deco sync-mirror PR on the CLIENT repo
 *      (surfaced for the human to add the token + merge), and destroy+recreate
 *      the sandbox so the daemon clones the branch with package.json present
 *   3. advance to reviewing (code-review agent gate before the auto-merge)
 *
 * "Initial vs fix round" is derived from cf_deploy_url (unset until the first
 * deploy), matching deploying-cf's advanceAfterDeploy.
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import {
  createPullRequest,
  findOpenPullRequest,
  parseRepo,
} from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { installSyncWorkflow } from "../../lib/sync-install.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";

function isInitialMigration(site: SiteRow): boolean {
  return !site.cf_deploy_url;
}

function prTitle(site: SiteRow): string {
  return isInitialMigration(site)
    ? `TanStack Start migration — ${site.name}`
    : `fix round ${site.fix_sessions_done} — ${site.name}`;
}

function prBody(site: SiteRow): string {
  if (isInitialMigration(site)) {
    return [
      `Automatic migration of \`${site.source_repo}\` (Fresh/Deno) to TanStack Start, orchestrated by **tanstack-migrator**.`,
      "",
      `- Work branch: \`${site.work_branch}\``,
      `- Parity target: **${site.parity_target}%** vs ${site.prod_url}`,
      `- Reviewed by the code-review agent, then auto-merged; Cloudflare deploys \`main\` to \`*.workers.dev\`.`,
    ].join("\n");
  }
  return [
    `Fix round ${site.fix_sessions_done} for the TanStack migration of \`${site.name}\` (branch \`${site.work_branch}\`).`,
    "",
    "Drains a batch of `tanstack-migrator` issues. Reviewed by the code-review agent, then auto-merged.",
  ].join("\n");
}

/** Open the sync-mirror PR on the client repo (once). Never blocks the migration. */
async function installClientSyncWorkflow(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (!site.target_repo) return;
  const sync = await installSyncWorkflow(ctx, parseRepo(site.source_repo), {
    sourceRepo: site.source_repo,
    targetRepo: site.target_repo,
    base: site.source_branch,
  });
  if (sync.installed && sync.reason !== "reused") {
    await addEvent(
      site.id,
      `.deco sync PR opened on ${site.source_repo} (${sync.prUrl ?? "?"}) — add the ${sync.tokenSecret} secret + merge to activate`,
    );
  } else if (!sync.installed && sync.reason !== "up-to-date") {
    await addEvent(
      site.id,
      `.deco sync PR not opened on ${site.source_repo} (${sync.reason.slice(0, 150)}) — install ${sync.path} manually`,
      "warn",
    );
  }
}

export async function openingPr(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (isSimulation(ctx)) {
    await updateSite(site.id, {
      status: "reviewing",
      pr_number: site.pr_number ?? 1,
      pr_url:
        site.pr_url ??
        `https://github.com/${site.target_repo ?? "sim/sim"}/pull/1`,
      phase_detail: "[simulation] PR opened, reviewing",
      phase_thread_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "[simulation] PR opened (branch → main)");
    return;
  }

  if (!site.target_repo) throw new Error("target_repo not set");
  const ref = parseRepo(site.target_repo);
  const branch = site.work_branch;
  const initial = isInitialMigration(site);

  // 1. the PR (idempotent: reuse the branch's open PR on re-runs)
  let prPatch: Partial<SiteRow> = {};
  if (!site.pr_number) {
    const existing = await findOpenPullRequest(ctx, ref, branch).catch(
      () => null,
    );
    if (existing) {
      prPatch = {
        pr_number: existing.number,
        pr_url:
          existing.url ??
          `https://github.com/${site.target_repo}/pull/${existing.number}`,
      };
      await addEvent(
        site.id,
        `PR #${existing.number} already existed for ${branch} — reusing it`,
      );
    } else {
      try {
        const pr = await createPullRequest(ctx, ref, {
          title: prTitle(site),
          body: prBody(site),
          head: branch,
          base: "main",
        });
        prPatch = {
          pr_number: pr.number,
          pr_url:
            pr.url ??
            `https://github.com/${site.target_repo}/pull/${pr.number}`,
        };
        await addEvent(
          site.id,
          `PR #${pr.number} opened (${branch} → main): ${prPatch.pr_url}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/already exists|pull request already/i.test(message)) throw err;
        // a PR exists but findOpenPullRequest missed it — fail retryably
        // instead of continuing without a number (that would skip the gate)
        throw new Error(
          `PR for ${branch} already exists but was not located (${message.slice(0, 120)}) — retry will find it again`,
        );
      }
    }
  }

  // 2. INITIAL migration only: client sync PR + sandbox recreate (fix rounds
  // reuse the existing sandbox and the sync is already on the client repo).
  if (initial) {
    try {
      await installClientSyncWorkflow(site, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await addEvent(
        site.id,
        `.deco sync PR step skipped (${message.slice(0, 150)})`,
        "warn",
      );
    }

    // fresh sandbox — destroy + recreate so the daemon clones the branch WITH
    // package.json already present (provisioning_sandbox ran on an empty repo).
    try {
      await getDriver(ctx).destroy({ ...site, ...prPatch } as SiteRow, ctx);
    } catch {
      // sandbox may have already expired — ignore
    }
    try {
      const info = await getDriver(ctx).ensure(
        { ...site, ...prPatch } as SiteRow,
        ctx,
      );
      prPatch = {
        ...prPatch,
        sandbox_handle: info.handle,
        sandbox_preview_url: info.previewUrl,
        preview_ready: false,
      };
      await addEvent(
        site.id,
        "Sandbox recreated — daemon clones the branch with package.json, installs deps and starts the dev server",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await addEvent(
        site.id,
        `Sandbox recreation failed (${message.slice(0, 160)}) — keepalive retries on the next tick`,
        "warn",
      );
    }
  }

  await updateSite(site.id, {
    ...prPatch,
    status: "reviewing",
    phase_detail: `PR #${prPatch.pr_number ?? site.pr_number} opened — reviewing`,
    phase_thread_id: null,
    last_progress_at: new Date().toISOString(),
  });
}
