/**
 * Phase: creating_repo — create deco-sites/<name>-tanstack and mint the
 * durable GitHub grant used by the sandbox for pushes.
 */

import { addEvent } from "../../db/events.ts";
import type { SiteRow } from "../../db/types.ts";
import { updateSite } from "../../db/sites.ts";
import {
  ensureRepo,
  mintRepoGrant,
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
      phase_detail: `[simulação] repo ${targetRepo} criado`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, `[simulação] repo ${targetRepo} criado`);
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
        needs_human_reason: `${err.message}. Crie o repo manualmente (gh repo create ${targetRepo} --private) OU dê à GitHub App da deco a permissão de Administration (write) na org, e use Retry.`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        "GitHub App sem permissão de criar repo — precisa de humano",
        "warn",
      );
      return;
    }
    throw err;
  }
  await addEvent(site.id, `Repo ${targetRepo} garantido no GitHub`);

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
      await addEvent(
        site.id,
        "Grant de push do GitHub mintado (MINT_REPO_TOKEN)",
      );
    } catch (err) {
      await addEvent(
        site.id,
        `Sem grant de push (${err instanceof Error ? err.message : err}) — o sandbox usará as credenciais git sincronizadas pelo mesh`,
        "warn",
      );
    }
  }

  await updateSite(site.id, {
    ...grantPatch,
    target_repo: targetRepo,
    status: "provisioning_sandbox",
    phase_detail: "repo criado, provisionando sandbox",
    last_progress_at: new Date().toISOString(),
  });
}
