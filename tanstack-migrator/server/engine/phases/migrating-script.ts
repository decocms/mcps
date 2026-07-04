/**
 * Phase: migrating_script — ONE bounded session runs the @decocms/start
 * migrate script and pushes the raw output to the work branch. It ends at
 * the checkpoint push on purpose: build fixing belongs to the issue-driven
 * loop (triaging → fixing), in short sessions that can't lose much when the
 * turn/window limit hits.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, incrementCost, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { ghsTokenForSite } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { migrateScriptPrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

export async function migratingScript(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  if (deps.inflight.has(site.id)) return; // session running in this pod

  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return; // another pod's session looks alive — just wait

  const run = await createRun({ siteId: site.id, kind: "migrate" });
  await markSessionStart(site.id, "migrate");
  await addEvent(site.id, "Sessão do script de migração iniciada");

  deps.inflight.start(site.id, "migrate", async () => {
    try {
      let prompt = "";
      if (!isSimulation(ctx)) {
        const { token, grant } = await ghsTokenForSite(ctx, site);
        if (grant?.refreshToken) {
          await updateSite(site.id, {
            gh_refresh_token: grant.refreshToken,
            gh_token_endpoint: grant.tokenEndpoint ?? null,
            gh_client_id: grant.clientId ?? null,
          });
        }
        prompt = migrateScriptPrompt({ site, ghToken: token });
      }

      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "migrate",
        prompt,
        runId: run.id,
        threadId: site.phase_thread_id ?? undefined,
        timeoutMs: SESSION_TIMEOUT_MS.migrate,
      });
      await incrementCost(site.id, result.meta?.usage?.costUsd);

      const current = await getSite(site.id);
      if (!current || current.status !== "migrating_script") {
        // site paused/changed mid-session — close the run row so the
        // history never shows a phantom "running" entry
        await finishRun(run.id, {
          status: "failed",
          logsTail: `[abandonada: site saiu de migrating_script durante a sessão]`,
          meta: result.meta,
        });
        return;
      }

      if (result.ok) {
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
          meta: result.meta,
        });
        await updateSite(site.id, {
          status: "opening_pr",
          phase_detail: `checkpoint pushado na branch ${site.work_branch}, abrindo PR`,
          sandbox_session_id: null,
          phase_thread_id: null, // next phase starts a fresh conversation
          transient_retries: 0,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `Script de migração concluído — checkpoint na branch ${site.work_branch}`,
        );
      } else {
        await finishRun(run.id, {
          status: "failed",
          logsTail: result.output,
          meta: result.meta,
        });
        // phase_thread_id stays — a retry continues the same conversation
        await failOrAutoRetry(
          current,
          result.error ?? "script de migração falhou",
          "migrating_script",
          "Script de migração falhou",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) {
        await failOrAutoRetry(
          current,
          message,
          "migrating_script",
          "Script de migração falhou",
        );
      }
    }
  });
}
