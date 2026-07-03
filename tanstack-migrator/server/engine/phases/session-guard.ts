/**
 * Cross-pod session guard. sandbox_session_id marks "a bounded session is
 * (probably) running somewhere". This pod only relaunches when the marker is
 * stale (no progress for WATCHDOG_STALL_MS) — otherwise it waits, since the
 * session may belong to another pod during a rolling deploy.
 */

import { WATCHDOG_STALL_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import type { EngineDeps } from "../machine.ts";

/** @returns true when this pod may launch a new session for the site. */
export async function clearStaleSession(
  site: SiteRow,
  deps: EngineDeps,
): Promise<boolean> {
  if (!site.sandbox_session_id) return true;
  if (deps.inflight.has(site.id)) return false;

  const lastProgress = Date.parse(
    site.last_progress_at ?? site.updated_at ?? site.created_at,
  );
  const stale = Date.now() - lastProgress > WATCHDOG_STALL_MS;
  if (!stale) return false;

  await updateSite(site.id, { sandbox_session_id: null });
  await addEvent(
    site.id,
    "Sessão anterior ficou sem progresso — relançando",
    "warn",
  );
  return true;
}

export async function markSessionStart(
  siteId: string,
  kind: string,
): Promise<void> {
  await updateSite(siteId, {
    sandbox_session_id: `${kind}:${Date.now()}`,
    last_progress_at: new Date().toISOString(),
  });
}
