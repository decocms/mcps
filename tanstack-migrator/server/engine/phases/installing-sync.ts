/**
 * Phase: installing_sync — push the .deco content-sync workflow into the
 * -tanstack repo (MCP-side, via the GITHUB binding): workflow yml + script
 * shim + package.json script entry. Idempotent (putFile skips unchanged).
 *
 * Note: pushing .github/workflows/* requires the GitHub App to have
 * workflows:write. When GitHub rejects, we degrade to needs_human with a
 * clear reason instead of failing the whole migration.
 */

import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { getFile, parseRepo, putFile } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { isSimulation } from "../../sandbox/client.ts";
import {
  SYNC_PACKAGE_SCRIPT_NAME,
  SYNC_SCRIPT_PATH,
  SYNC_WORKFLOW_PATH,
  syncPackageScriptCommand,
  syncScriptSource,
  syncWorkflowYaml,
} from "../../sandbox/templates/sync-files.ts";

export async function installingSync(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (isSimulation(ctx)) {
    await updateSite(site.id, {
      status: "validating3",
      phase_detail: "[simulação] sync do .deco instalado",
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "[simulação] workflow de sync do .deco instalado");
    return;
  }

  if (!site.target_repo) throw new Error("target_repo not set");
  const ref = parseRepo(site.target_repo);
  const run = await createRun({ siteId: site.id, kind: "install_sync" });

  try {
    await putFile(ctx, ref, {
      path: SYNC_SCRIPT_PATH,
      content: syncScriptSource(),
      message: "chore: add .deco sync script (tanstack-migrator)",
    });

    // package.json: read-modify-write to add the sync:decofile script
    const pkgFile = await getFile(ctx, ref, "package.json");
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
          });
        }
      } catch {
        await addEvent(
          site.id,
          "package.json não parseável — script sync:decofile não adicionado",
          "warn",
        );
      }
    }

    await putFile(ctx, ref, {
      path: SYNC_WORKFLOW_PATH,
      content: syncWorkflowYaml({ prodUrl: site.prod_url }),
      message: "ci: sync .deco/blocks from production (tanstack-migrator)",
    });

    await finishRun(run.id, { status: "succeeded" });
    await updateSite(site.id, {
      status: "validating3",
      phase_detail: "sync do .deco instalado, iniciando loop de paridade",
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(site.id, "Workflow de sync do .deco instalado no repo");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, { status: "failed", logsTail: message });

    if (/workflow|permission|403|resource not accessible/i.test(message)) {
      // App lacks workflows:write — a human installs the workflow, then resumes
      await updateSite(site.id, {
        status: "needs_human",
        resume_status: "validating",
        needs_human_reason: `GitHub recusou o push do workflow (${message}). Instale ${SYNC_WORKFLOW_PATH} manualmente no repo ${site.target_repo} e use SITE_RETRY para seguir para a validação.`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        "Push do workflow negado — precisa de humano",
        "warn",
      );
      return;
    }
    throw err;
  }
}
