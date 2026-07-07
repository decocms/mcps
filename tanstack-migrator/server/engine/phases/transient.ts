/**
 * Shared failure routing for session phases: zombie-signature failures
 * (stale platform replicas still running pre-#491 code answer sessions with
 * legacy 404s) auto-retry in place — the next tick rolls the dice again and
 * eventually a fresh pod claims it. Everything else fails hard with a
 * resume_status so SITE_RETRY re-enters the same phase.
 *
 * Retries count on transient_retries — NOT no_improve_count, which measures
 * parity-score stagnation (a different control loop). Phases reset
 * transient_retries on success.
 */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow, SiteStatus } from "../../db/types.ts";

export const TRANSIENT_ZOMBIE_SIGNATURE =
  /decopilot (stream|message dispatch|thread stream) failed \(404\)|organization .+ not found/i;
/**
 * Turn-limit deaths: the harness ends the turn mid-work and the session
 * never emits its RESULT_JSON. Retrying CONTINUES the same thread
 * (phase_thread_id is kept on failure), so each retry is another chapter
 * of the same conversation — the agent picks up where it died.
 */
export const RESUMABLE_SESSION_SIGNATURE =
  /session ended without a RESULT_JSON line/i;
export const MAX_TRANSIENT_RETRIES = 12;

/** `retryStatus` = the phase to stay in on a transient failure (usually the current one). */
export async function failOrAutoRetry(
  site: SiteRow,
  message: string,
  retryStatus: SiteStatus,
  label: string,
): Promise<void> {
  const zombie = TRANSIENT_ZOMBIE_SIGNATURE.test(message);
  const turnLimit = RESUMABLE_SESSION_SIGNATURE.test(message);
  const transient =
    (zombie || turnLimit) && site.transient_retries < MAX_TRANSIENT_RETRIES;

  if (transient) {
    const reason = turnLimit
      ? "session hit the turn limit — continuing the same thread"
      : "session landed on a stale replica — trying again";
    await updateSite(site.id, {
      status: retryStatus,
      transient_retries: site.transient_retries + 1,
      phase_detail: `${reason} (${site.transient_retries + 1}/${MAX_TRANSIENT_RETRIES})`,
      sandbox_session_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `${reason} — automatic retry ${site.transient_retries + 1}/${MAX_TRANSIENT_RETRIES}`,
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
