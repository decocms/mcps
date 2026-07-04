/**
 * Phase: migrating — one bounded session runs the @decocms/start migrate
 * script (7 phases), fixes build/typecheck, pushes the initial commit and
 * leaves `bun dev` up. Launched fire-and-forget via the inflight tracker;
 * the tick loop keeps the sandbox TTL alive while it runs.
 */

import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import { isMigratingStatus, type SiteRow } from "../../db/types.ts";
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
      if (!current || !isMigratingStatus(current.status)) return; // paused/changed meanwhile

      if (result.ok) {
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
        });
        await updateSite(site.id, {
          status: "installing_sync",
          phase_detail: "migração inicial concluída, instalando sync do .deco",
          sandbox_session_id: null,
          no_improve_count: 0, // used as transient-retry counter during migrate
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
        await failOrAutoRetry(
          current,
          result.error ?? "migração inicial falhou",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) await failOrAutoRetry(current, message);
    }
  });
}

/**
 * Zombie-signature failures (stale platform replicas still running pre-#491
 * code answer sessions with the legacy 404s) auto-retry: stay in `migrating`
 * so the next tick rolls the dice again — eventually a fresh pod claims it.
 * Bounded by MAX_TRANSIENT_RETRIES (no_improve_count doubles as the counter
 * here; the parity loop resets it when validation starts).
 */
const TRANSIENT_ZOMBIE_SIGNATURE =
  /decopilot (stream|message dispatch|thread stream) failed \(404\)|organization .+ not found/i;
const MAX_TRANSIENT_RETRIES = 12;

async function failOrAutoRetry(site: SiteRow, message: string): Promise<void> {
  const transient =
    TRANSIENT_ZOMBIE_SIGNATURE.test(message) &&
    site.no_improve_count < MAX_TRANSIENT_RETRIES;

  if (transient) {
    await updateSite(site.id, {
      status: "migrating2",
      no_improve_count: site.no_improve_count + 1,
      phase_detail: `sessão caiu em réplica desatualizada — tentando de novo (${site.no_improve_count + 1}/${MAX_TRANSIENT_RETRIES})`,
      sandbox_session_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Sessão falhou em réplica desatualizada, retry automático ${site.no_improve_count + 1}/${MAX_TRANSIENT_RETRIES}: ${message.slice(0, 160)}`,
      "warn",
    );
    return;
  }

  await updateSite(site.id, {
    status: "failed",
    resume_status: "migrating",
    error: message,
    sandbox_session_id: null,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(site.id, `Migração falhou: ${message}`, "error");
}
