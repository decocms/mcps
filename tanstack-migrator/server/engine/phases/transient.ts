/**
 * Shared failure routing for session phases: zombie-signature failures
 * (stale platform replicas still running pre-#491 code answer sessions with
 * legacy 404s) auto-retry in place — the next tick rolls the dice again and
 * eventually a fresh pod claims it. Everything else fails hard with a
 * resume_status so SITE_RETRY re-enters the same phase.
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow, SiteStatus } from "../../db/types.ts";

export const TRANSIENT_ZOMBIE_SIGNATURE =
  /decopilot (stream|message dispatch|thread stream) failed \(404\)|organization .+ not found/i;
export const MAX_TRANSIENT_RETRIES = 12;

/**
 * `retryStatus` = the phase to stay in on a transient failure (usually the
 * current one). no_improve_count doubles as the transient counter outside
 * the parity loop; paritying resets it on real score movement.
 */
export async function failOrAutoRetry(
  site: SiteRow,
  message: string,
  retryStatus: SiteStatus,
  label: string,
): Promise<void> {
  const transient =
    TRANSIENT_ZOMBIE_SIGNATURE.test(message) &&
    site.no_improve_count < MAX_TRANSIENT_RETRIES;

  if (transient) {
    await updateSite(site.id, {
      status: retryStatus,
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
    resume_status: retryStatus,
    error: message,
    sandbox_session_id: null,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(site.id, `${label}: ${message}`, "error");
}
