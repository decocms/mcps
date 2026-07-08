/**
 * Phase: creating_repo — create deco-sites/<name>-tanstack and mint the
 * durable GitHub grant used by the sandbox for pushes.
 */

import { setSitePlatform } from "../../db/catalog.ts";
import { addEvent } from "../../db/events.ts";
import type { SiteRow } from "../../db/types.ts";
import { updateSite } from "../../db/sites.ts";
import {
  ensureBranch,
  ensureRepo,
  getFile,
  mintRepoGrant,
  parseRepo,
  putFile,
  RepoCreatePermissionError,
  targetRepoFor,
} from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { isSimulation } from "../../sandbox/client.ts";

export async function creatingRepo(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  const targetRepo =
    site.target_repo ?? targetRepoFor(site, ctx.config.githubOrg);

  if (isSimulation(ctx)) {
    await updateSite(site.id, {
      target_repo: targetRepo,
      status: "provisioning_sandbox",
      phase_detail: `[simulation] repo ${targetRepo} created`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, `[simulation] repo ${targetRepo} created`);
    return;
  }

  try {
    await ensureRepo(ctx, targetRepo);
  } catch (err) {
    if (err instanceof RepoCreatePermissionError) {
      await updateSite(site.id, {
        target_repo: targetRepo,
        status: "needs_human",
        resume_status: "creating_repo",
        needs_human_reason: `${err.message}. Create the repo manually (gh repo create ${targetRepo} --private) OR grant deco's GitHub App the Administration (write) permission on the org, and use Retry.`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        "GitHub App lacks permission to create repo — needs human",
        "warn",
      );
      return;
    }
    throw err;
  }
  await addEvent(site.id, `Repo ${targetRepo} ensured on GitHub`);

  // Flag it as a CF Workers Builds site so the Fresh/Deno k8s deployer ignores
  // it. Best-effort + early — the catalog row often isn't indexed yet at this
  // point (the deploy phase re-asserts it once it is).
  const plat = await setSitePlatform(targetRepo);
  if (plat.ok && plat.reason === "updated") {
    await addEvent(site.id, `Catalog: ${targetRepo} marked cfworkers-builds`);
  }

  // main must exist (repos are created empty) — it's the PR base — and the
  // work branch must exist BEFORE SANDBOX_START: sandbox clone + decopilot
  // threads are pinned to it.
  const ref = parseRepo(targetRepo);
  const readme = await getFile(ctx, ref, "README.md");
  if (!readme) {
    await putFile(ctx, ref, {
      path: "README.md",
      content: `# ${ref.repo}\n\nTanStack Start migration of \`${site.source_repo}\` — managed by tanstack-migrator.\n`,
      message: "chore: init (tanstack-migrator)",
    });
    await addEvent(site.id, "Branch main initialized (README)");
  }
  await ensureBranch(ctx, ref, site.work_branch);
  await addEvent(
    site.id,
    `Work branch ${site.work_branch} ensured (PR base: main)`,
  );

  // The push grant is optional: the mesh sandbox gets git credentials synced
  // for the virtualMcp's githubRepo connection (sync-git-credentials), so
  // sessions can push without an embedded token. Mint only when configured.
  let grantPatch: Partial<SiteRow> = {};
  if (!site.gh_refresh_token && ctx.config.githubInstallationId) {
    try {
      const grant = await mintRepoGrant(ctx, targetRepo);
      grantPatch = {
        gh_refresh_token: grant.refreshToken ?? null,
        gh_token_endpoint: grant.tokenEndpoint ?? null,
        gh_client_id: grant.clientId ?? null,
      };
      await addEvent(site.id, "GitHub push grant minted (MINT_REPO_TOKEN)");
    } catch (err) {
      await addEvent(
        site.id,
        `No push grant (${err instanceof Error ? err.message : err}) — the sandbox will use the git credentials synced by the mesh`,
        "warn",
      );
    }
  }

  await updateSite(site.id, {
    ...grantPatch,
    target_repo: targetRepo,
    status: "provisioning_sandbox",
    phase_detail: "repo created, provisioning sandbox",
    last_progress_at: new Date().toISOString(),
  });
}
