/**
 * Phase: migrating — one bounded session runs the @decocms/start migrate
 * script (7 phases), fixes build/typecheck, pushes the initial commit and
 * leaves `bun dev` up. Launched fire-and-forget via the inflight tracker;
 * the tick loop keeps the sandbox TTL alive while it runs.
 */

import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { ghsTokenForSite } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { migratePrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";

export async function migrating(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  if (deps.inflight.has(site.id)) return; // session running in this pod

  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return; // another pod's session looks alive — just wait

  const run = await createRun({ siteId: site.id, kind: "migrate" });
  await markSessionStart(site.id, "migrate");
  await addEvent(site.id, "Sessão de migração inicial iniciada");

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
        prompt = migratePrompt({
          site,
          ghToken: token,
          anthropicApiKey: ctx.config.anthropicApiKey,
        });
      }

      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "migrate",
        prompt,
      });

      const current = await getSite(site.id);
      if (!current || current.status !== "migrating") return; // paused/changed meanwhile

      if (result.ok) {
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
        });
        await updateSite(site.id, {
          status: "installing_sync",
          phase_detail: "migração inicial concluída, instalando sync do .deco",
          sandbox_session_id: null,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          "Migração inicial concluída (build verde, push feito)",
        );
      } else {
        await finishRun(run.id, {
          status: "failed",
          logsTail: result.output,
        });
        await updateSite(site.id, {
          status: "failed",
          error: result.error ?? "migração inicial falhou",
          sandbox_session_id: null,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(site.id, `Migração falhou: ${result.error}`, "error");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      await updateSite(site.id, {
        status: "failed",
        error: message,
        sandbox_session_id: null,
      });
      await addEvent(site.id, `Migração falhou: ${message}`, "error");
    }
  });
}
