/**
 * Phase: opening_pr — MCP-side (no session):
 *   1. add the .deco sync workflow files to the WORK BRANCH (part of the PR
 *      diff; GitHub cron only runs on the default branch, so it activates
 *      after the merge — during migration the agent runs sync:decofile
 *      in-session when it needs fresh content)
 *   2. open the PR work_branch → main (the human merge is the go-live)
 *   3. re-SANDBOX_START so the daemon takes over install + dev server now
 *      that the branch has a package.json
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import {
  createPullRequest,
  findOpenPullRequest,
  getFile,
  parseRepo,
  putFile,
} from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import {
  SYNC_PACKAGE_SCRIPT_NAME,
  SYNC_SCRIPT_PATH,
  SYNC_WORKFLOW_PATH,
  syncPackageScriptCommand,
  syncScriptSource,
  syncWorkflowYaml,
} from "../../sandbox/templates/sync-files.ts";

function prBody(site: SiteRow): string {
  return [
    `Automatic migration of \`${site.source_repo}\` (Fresh/Deno) to TanStack Start, orchestrated by **tanstack-migrator**.`,
    "",
    `- Work branch: \`${site.work_branch}\` — short sessions commit here`,
    `- Backlog: issues with the \`tanstack-migrator\` label (closed as fixes are pushed)`,
    `- Parity target: **${site.parity_target}%** vs ${site.prod_url}`,
    `- The \`.deco\` sync workflow is in this diff and activates after the merge (cron only runs on the default branch)`,
    "",
    "**Merge = go-live**: the Cloudflare project watches main and deploys on merge.",
  ].join("\n");
}

export async function openingPr(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (isSimulation(ctx)) {
    await updateSite(site.id, {
      status: "triaging",
      pr_number: site.pr_number ?? 1,
      pr_url:
        site.pr_url ??
        `https://github.com/${site.target_repo ?? "sim/sim"}/pull/1`,
      phase_detail: "[simulation] PR opened, triaging issues",
      phase_thread_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "[simulation] PR opened (work branch → main)");
    return;
  }

  if (!site.target_repo) throw new Error("target_repo not set");
  const ref = parseRepo(site.target_repo);
  const branch = site.work_branch;

  // 1. sync files on the work branch — nice-to-have: a permission failure
  // (workflows:write) must not block the migration
  try {
    await putFile(ctx, ref, {
      path: SYNC_SCRIPT_PATH,
      content: syncScriptSource(),
      message: "chore: add .deco sync script (tanstack-migrator)",
      branch,
    });
    const pkgFile = await getFile(ctx, ref, "package.json", branch);
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.text) as {
          scripts?: Record<string, string>;
        };
        const command = syncPackageScriptCommand(site.prod_url);
        if (pkg.scripts?.[SYNC_PACKAGE_SCRIPT_NAME] !== command) {
          pkg.scripts = { ...pkg.scripts, [SYNC_PACKAGE_SCRIPT_NAME]: command };
          await putFile(ctx, ref, {
            path: "package.json",
            content: `${JSON.stringify(pkg, null, 2)}\n`,
            message: "chore: add sync:decofile script (tanstack-migrator)",
            branch,
          });
        }
      } catch {
        await addEvent(
          site.id,
          "package.json not parseable — sync:decofile script not added",
          "warn",
        );
      }
    }
    await putFile(ctx, ref, {
      path: SYNC_WORKFLOW_PATH,
      content: syncWorkflowYaml({ prodUrl: site.prod_url }),
      message: "ci: sync .deco/blocks from production (tanstack-migrator)",
      branch,
    });
    await addEvent(
      site.id,
      ".deco sync added to the branch (activates after the merge)",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addEvent(
      site.id,
      `.deco sync not installed (${message.slice(0, 160)}) — install ${SYNC_WORKFLOW_PATH} manually after the merge`,
      "warn",
    );
  }

  // 2. the PR (idempotent: reuse the branch's open PR on re-runs)
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
          title: `TanStack Start migration — ${site.name}`,
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
        // instead of continuing without a number (that would skip the merge gate)
        throw new Error(
          `PR for ${branch} already exists but was not located (${message.slice(0, 120)}) — retry will find it again`,
        );
      }
    }
  }

  // 3. fresh sandbox — destroy + recreate so the daemon clones the branch
  // WITH package.json already present (provisioning_sandbox ran when the repo
  // was still empty; the daemon marks packageManager=null and never recovers).
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

  await updateSite(site.id, {
    ...prPatch,
    status: "triaging",
    phase_detail: "PR opened, triaging issues",
    phase_thread_id: null,
    last_progress_at: new Date().toISOString(),
  });
}
