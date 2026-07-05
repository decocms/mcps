/**
 * Background worker — the heart of the orchestrator.
 *
 * setImmediate(bootstrap) + setInterval(tick). Every tick, per connection:
 *   1. sweep: translate legacy statuses, revive zombie-killed sites
 *   2. watchdog: active sites without progress for WATCHDOG_STALL_MS → failed
 *      (or needs_human("mesh offline") when the mesh itself is unreachable)
 *   3. fill slots: FIFO-start queued sites while active < MAX_CONCURRENT
 *   4. advance: run the phase handler for each active site (lease-guarded)
 *   5. keepalive + liveness: reset sandbox TTL; probe stalled sessions on
 *      the mesh (dead reader vs dead mesh vs slow agent)
 *   6. poll: awaiting_merge sites (no slot) check their PR state
 *
 * All state lives in Supabase — a pod restart resumes from the DB (discord
 * MCP pattern). Long sessions run fire-and-forget via InflightTracker.
 */

import packageJson from "../../package.json" with { type: "json" };
import {
  LEASE_TTL_MS,
  LIVENESS_STALL_MS,
  TICK_INTERVAL_MS,
  WATCHDOG_STALL_MS,
} from "../constants.ts";
import { isSupabaseConfigured } from "../db/client.ts";
import { loadAllConnections, saveConnection } from "../db/connections.ts";
import { addEvent } from "../db/events.ts";
import { closeOpenRunsForSite, closeStaleRuns } from "../db/runs.ts";
import {
  acquireLease,
  getSite,
  listSites,
  releaseLease,
  updateSite,
} from "../db/sites.ts";
import {
  ACTIVE_STATUSES,
  isActiveStatus,
  isLegacyStatus,
  isSessionStatus,
  POLLING_STATUSES,
  type SiteRow,
  toCurrentStatus,
} from "../db/types.ts";
import {
  buildWorkerCtx,
  callSelfTool,
  resolveMeshUrl,
  type WorkerCtx,
} from "../lib/mesh.ts";
import { previewRendersRealHtml } from "../lib/preview.ts";
import { getDriver } from "../sandbox/client.ts";
import { InflightTracker } from "./inflight.ts";
import { type EngineDeps, PHASE_HANDLERS } from "./machine.ts";

const WORKER_ID = `pod-${crypto.randomUUID().slice(0, 8)}`;
const KEEPALIVE_INTERVAL_MS = 5 * 60_000;

const inflight = new InflightTracker();
const deps: EngineDeps = { inflight };
const lastKeepalive = new Map<string, number>();
const lastLivenessProbe = new Map<string, number>();

let interval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function getInflightTracker(): InflightTracker {
  return inflight;
}

function stalenessMs(site: SiteRow): number {
  const lastProgress = Date.parse(
    site.last_progress_at ?? site.updated_at ?? site.created_at,
  );
  return Date.now() - lastProgress;
}

/** Any HTTP answer counts — we only care whether the mesh process is there. */
async function meshReachable(ctx: WorkerCtx): Promise<boolean> {
  try {
    await fetch(resolveMeshUrl(ctx.meshUrl), {
      method: "HEAD",
      signal: AbortSignal.timeout(3_000),
    });
    return true;
  } catch {
    return false;
  }
}

const CONNECTION_ERROR_SIGNATURE =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|socket|timed? ?out|HTTP 5\d\d/i;

async function watchdog(site: SiteRow, ctx: WorkerCtx): Promise<boolean> {
  if (inflight.has(site.id)) return false; // work is genuinely running here
  if (stalenessMs(site) <= WATCHDOG_STALL_MS) return false;

  // The "parou no 59" case: the local mesh process died mid-session and the
  // pipeline stayed silent. A stalled SESSION with an unreachable mesh is a
  // platform outage, not a migration failure.
  if (isSessionStatus(site.status) && !(await meshReachable(ctx))) {
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: site.status,
      needs_human_reason: `Mesh inacessível em ${ctx.meshUrl} — a sessão ficou órfã (sem progresso há ${Math.round(stalenessMs(site) / 60_000)}min). Suba o mesh e use Retry.`,
      sandbox_session_id: null,
      lease_owner: null,
      lease_expires_at: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Watchdog: mesh offline (${ctx.meshUrl}) — sessão órfã, precisa de humano`,
      "error",
    );
    return true;
  }

  await updateSite(site.id, {
    status: "failed",
    resume_status: site.status,
    error: `Sem progresso há mais de ${Math.round(WATCHDOG_STALL_MS / 60_000)}min (watchdog)`,
    sandbox_session_id: null,
    lease_owner: null,
    lease_expires_at: null,
  });
  await addEvent(
    site.id,
    "Watchdog: sem progresso, marcado como failed",
    "error",
  );
  return true;
}

/**
 * Liveness probe for stalled in-flight sessions (heartbeat missing for
 * LIVENESS_STALL_MS but before the watchdog window). Distinguishes:
 *   - agent still working (thread in_progress, reader just slow/dead)
 *   - thread finished but the reader died (pod restart) → clear the session
 *     marker so the phase relaunches (multi-turn continues the thread)
 *   - mesh unreachable → say it LOUD (needs_human) instead of silence
 */
async function probeSessionLiveness(
  staleRow: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  // advanceSite may have just progressed the site — never act on the
  // pre-advance snapshot (a stale probe could needs_human a healthy site)
  const site = await getSite(staleRow.id).catch(() => null);
  if (!site) return;
  if (!isSessionStatus(site.status)) return;
  if (!site.sandbox_session_id || !site.phase_thread_id) return;
  const staleness = stalenessMs(site);
  if (staleness < LIVENESS_STALL_MS || staleness > WATCHDOG_STALL_MS) return;
  const last = lastLivenessProbe.get(site.id) ?? 0;
  if (Date.now() - last < LIVENESS_STALL_MS) return;
  lastLivenessProbe.set(site.id, Date.now());

  const minutes = Math.round(staleness / 60_000);
  try {
    const result = await callSelfTool<{ item?: { status?: string } }>(
      ctx,
      "COLLECTION_THREADS_GET",
      { id: site.phase_thread_id },
      15_000,
    );
    const status = result?.item?.status ?? "desconhecido";
    if (status === "in_progress" || status === "requires_action") {
      await addEvent(
        site.id,
        `Liveness: thread ${site.phase_thread_id} segue ${status}, mas sem heartbeat há ${minutes}min (leitor pode ter morrido — rescue automático segue tentando)`,
        "warn",
      );
      return;
    }
    // Terminal thread with a dead reader: free the session marker so the
    // phase relaunches next tick (the reused thread keeps the context), and
    // close the dangling run row NOW — the history should never show a
    // phantom "running" entry until the 50min sweep.
    await closeOpenRunsForSite(
      site.id,
      `[leitor morreu; fase repicada — thread ${site.phase_thread_id} ${status}]`,
    ).catch(() => {});
    await updateSite(site.id, {
      sandbox_session_id: null,
      phase_detail: `thread terminou (${status}) com o leitor morto — repicando a fase`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Liveness: thread ${site.phase_thread_id} terminou (${status}) mas o leitor morreu — fase será repicada`,
      "warn",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!CONNECTION_ERROR_SIGNATURE.test(message)) {
      // tool-level error (e.g. thread not found) — let the phase machinery deal
      await addEvent(
        site.id,
        `Liveness: probe da thread falhou (${message.slice(0, 120)})`,
        "warn",
      );
      return;
    }
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: site.status,
      needs_human_reason: `Mesh inacessível em ${ctx.meshUrl} (${message.slice(0, 160)}). A sessão ${site.phase_thread_id} ficou órfã — suba o mesh e use Retry.`,
      sandbox_session_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Mesh inacessível — sessão órfã (${message.slice(0, 120)})`,
      "error",
    );
  }
}

async function probePreviewIfNeeded(site: SiteRow): Promise<void> {
  if (!site.sandbox_preview_url || site.preview_ready) return;
  if (!isActiveStatus(site.status)) return;
  if (!(await previewRendersRealHtml(site.sandbox_preview_url, 4_000))) return;
  await updateSite(site.id, { preview_ready: true });
  await addEvent(
    site.id,
    `Site renderizando HTML — preview liberado: ${site.sandbox_preview_url}`,
  );
}

async function keepaliveIfNeeded(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (!site.sandbox_handle) return;
  const isWorking = inflight.has(site.id) || isSessionStatus(site.status);
  if (!isWorking) return;

  const last = lastKeepalive.get(site.id) ?? 0;
  if (Date.now() - last < KEEPALIVE_INTERVAL_MS) return;
  lastKeepalive.set(site.id, Date.now());

  try {
    await getDriver(ctx).keepalive(site, ctx);
  } catch (err) {
    console.warn(
      `[worker] keepalive failed for ${site.name}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function advanceSite(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  const handler = PHASE_HANDLERS[site.status];
  if (!handler) return;

  const leased = await acquireLease(site.id, WORKER_ID, LEASE_TTL_MS);
  if (!leased) return; // another pod is on it

  try {
    await handler(leased, ctx, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[worker] phase ${site.status} failed for ${site.name}:`,
      message,
    );
    await updateSite(site.id, {
      status: "failed",
      resume_status: site.status, // Retry resumes the failed phase, not the whole pipeline
      error: `${site.status}: ${message}`,
      sandbox_session_id: null,
    });
    await addEvent(site.id, `Fase ${site.status} falhou: ${message}`, "error");
  } finally {
    await releaseLease(site.id, WORKER_ID).catch(() => {});
  }
}

/**
 * Sweep: translate legacy (≤ v0.4.x) statuses to the current pipeline and
 * revive zombie-killed sites (stale platform replicas claim sessions, fail
 * them with legacy-protocol 404s and write a hard `failed` with THEIR old
 * code — the in-phase auto-retry never runs). Bounded by no_improve_count.
 */
const ZOMBIE_FAILURE_SIGNATURE =
  /decopilot (stream|message dispatch|thread stream) failed \(404\)|organization .+ not found/i;
const MAX_ZOMBIE_REVIVES = 12;

async function sweepSites(sites: SiteRow[]): Promise<void> {
  for (const site of sites) {
    if (isLegacyStatus(site.status)) {
      const translated = toCurrentStatus(site.status);
      // also drop the session marker: it was written by old code whose
      // reader will bail on the translated status anyway — keeping it would
      // stall the new pipeline for a full watchdog window
      await updateSite(site.id, {
        status: translated,
        sandbox_session_id: null,
      });
      await addEvent(
        site.id,
        `Status legado ${site.status} → ${translated} (pipeline v0.5.0)`,
      );
      site.status = translated;
      continue;
    }
    if (site.status !== "failed") continue;
    if (!site.error || !ZOMBIE_FAILURE_SIGNATURE.test(site.error)) continue;
    if (site.transient_retries >= MAX_ZOMBIE_REVIVES) continue;

    const resumeInto = site.resume_status
      ? toCurrentStatus(site.resume_status)
      : site.sandbox_handle && site.virtual_mcp_id
        ? "migrating_script"
        : "queued";

    await updateSite(site.id, {
      status: resumeInto,
      error: null,
      transient_retries: site.transient_retries + 1,
      phase_detail: `revivido após falha de réplica desatualizada (${site.transient_retries + 1}/${MAX_ZOMBIE_REVIVES})`,
      sandbox_session_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Falha de réplica desatualizada — retry automático ${site.transient_retries + 1}/${MAX_ZOMBIE_REVIVES} (retomando em ${resumeInto})`,
      "warn",
    );
    site.status = resumeInto;
  }
}

async function tickConnection(ctx: WorkerCtx): Promise<void> {
  const sites = await listSites({ connectionId: ctx.connectionId });

  await sweepSites(sites);

  const active = sites.filter((s) =>
    (ACTIVE_STATUSES as string[]).includes(s.status),
  );
  const queued = sites
    .filter((s) => s.status === "queued")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // 1. watchdog
  let activeCount = 0;
  const survivors: SiteRow[] = [];
  for (const site of active) {
    const killed = await watchdog(site, ctx);
    if (!killed) {
      survivors.push(site);
      activeCount++;
    }
  }

  // 2. fill slots (FIFO)
  for (const site of queued) {
    if (activeCount >= ctx.config.maxConcurrent) break;
    const leased = await acquireLease(site.id, WORKER_ID, LEASE_TTL_MS);
    if (!leased || leased.status !== "queued") continue;
    await updateSite(site.id, {
      status: "creating_repo",
      started_at: leased.started_at ?? new Date().toISOString(),
      error: null,
      phase_detail: "iniciando",
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Migração iniciada (slot ${activeCount + 1}/${ctx.config.maxConcurrent})`,
    );
    await releaseLease(site.id, WORKER_ID).catch(() => {});
    survivors.push({ ...leased, status: "creating_repo" });
    activeCount++;
  }

  // 3. advance + 4. keepalive/liveness
  for (const site of survivors) {
    await advanceSite(site, ctx);
    await keepaliveIfNeeded(site, ctx);
    await probeSessionLiveness(site, ctx);
    await probePreviewIfNeeded(site);
  }

  // 5. awaiting_merge: no slot, just poll the PR state
  const polling = sites.filter((s) =>
    (POLLING_STATUSES as string[]).includes(s.status),
  );
  for (const site of polling) {
    await advanceSite(site, ctx);
  }
}

/**
 * Version fence against stale platform replicas: every publish spawns a NEW
 * deployment while old ones keep Running (and ticking!) until the platform
 * reaps them. Workers persist the highest version seen per connection; any
 * worker running an older build stops processing that connection.
 */
const WORKER_VERSION = packageJson.version;
const WORKER_VERSION_STATE_KEY = "__WORKER_VERSION";

function versionTuple(v: string): number[] {
  return v.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isOlderVersion(mine: string, stored: string): boolean {
  const a = versionTuple(mine);
  const b = versionTuple(stored);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

const fencedLogged = new Set<string>();

export async function runTickOnce(): Promise<{
  connections: number;
  advanced: number;
}> {
  if (!isSupabaseConfigured()) return { connections: 0, advanced: 0 };
  // close run rows abandoned by readers that died with pod restarts
  await closeStaleRuns(50).catch(() => {});
  const rows = await loadAllConnections();
  let advanced = 0;
  for (const row of rows) {
    try {
      const stored =
        row.pinned?.[WORKER_VERSION_STATE_KEY] ??
        row.state?.[WORKER_VERSION_STATE_KEY];
      if (
        typeof stored === "string" &&
        isOlderVersion(WORKER_VERSION, stored)
      ) {
        if (!fencedLogged.has(row.connection_id)) {
          fencedLogged.add(row.connection_id);
          console.warn(
            `[worker] fenced: v${WORKER_VERSION} < v${stored} seen for ${row.connection_id} — this replica stops processing it`,
          );
        }
        continue;
      }
      // zombie /mcp replicas rewrite `state` wholesale (their zod strips the
      // fence key) — re-stamp whenever EITHER column lost the current version
      const stateStored = row.state?.[WORKER_VERSION_STATE_KEY];
      if (stored !== WORKER_VERSION || stateStored !== WORKER_VERSION) {
        // fence in BOTH columns: ≥0.4.1 replicas read pinned; older zombies
        // only read state (they rewrite it wholesale, but every fresh tick
        // re-stamps it — shrinks their attack window to one tick)
        await saveConnection({
          connectionId: row.connection_id,
          organizationId: row.organization_id,
          meshUrl: row.mesh_url,
          state: {
            ...(row.state ?? {}),
            [WORKER_VERSION_STATE_KEY]: WORKER_VERSION,
          },
          pinned: {
            ...(row.pinned ?? {}),
            [WORKER_VERSION_STATE_KEY]: WORKER_VERSION,
          },
        }).catch(() => {});
      }

      const ctx = buildWorkerCtx(row);
      await tickConnection(ctx);
      advanced++;
    } catch (err) {
      console.error(
        `[worker] tick failed for connection ${row.connection_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { connections: rows.length, advanced };
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await runTickOnce();
  } catch (err) {
    console.error(
      "[worker] tick error:",
      err instanceof Error ? err.message : err,
    );
  } finally {
    ticking = false;
  }
}

export function startWorker(): void {
  if (interval) return;
  console.log(
    `[worker] starting (${WORKER_ID}), tick every ${TICK_INTERVAL_MS / 1000}s`,
  );
  setImmediate(tick);
  interval = setInterval(tick, TICK_INTERVAL_MS);
}

export function stopWorker(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
