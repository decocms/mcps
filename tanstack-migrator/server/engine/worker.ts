/**
 * Background worker — the heart of the orchestrator.
 *
 * setImmediate(bootstrap) + setInterval(tick). Every tick, per connection:
 *   1. watchdog: active sites without progress for WATCHDOG_STALL_MS → failed
 *   2. fill slots: FIFO-start queued sites while active < MAX_CONCURRENT
 *   3. advance: run the phase handler for each active site (lease-guarded)
 *   4. keepalive: reset sandbox idle TTL for sites with in-flight sessions
 *
 * All state lives in Supabase — a pod restart resumes from the DB (discord
 * MCP pattern). Long sessions run fire-and-forget via InflightTracker.
 */

import packageJson from "../../package.json" with { type: "json" };
import {
  LEASE_TTL_MS,
  TICK_INTERVAL_MS,
  WATCHDOG_STALL_MS,
} from "../constants.ts";
import { isSupabaseConfigured } from "../db/client.ts";
import { loadAllConnections, saveConnection } from "../db/connections.ts";
import { addEvent } from "../db/events.ts";
import {
  acquireLease,
  listSites,
  releaseLease,
  updateSite,
} from "../db/sites.ts";
import {
  ACTIVE_STATUSES,
  isActiveStatus,
  isMigratingStatus,
  isValidatingStatus,
  type SiteRow,
  toV2Status,
} from "../db/types.ts";
import { buildWorkerCtx, type WorkerCtx } from "../lib/mesh.ts";
import { getDriver } from "../sandbox/client.ts";
import { InflightTracker } from "./inflight.ts";
import { type EngineDeps, PHASE_HANDLERS } from "./machine.ts";

const WORKER_ID = `pod-${crypto.randomUUID().slice(0, 8)}`;
const KEEPALIVE_INTERVAL_MS = 5 * 60_000;

const inflight = new InflightTracker();
const deps: EngineDeps = { inflight };
const lastKeepalive = new Map<string, number>();

let interval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function getInflightTracker(): InflightTracker {
  return inflight;
}

function isStale(site: SiteRow): boolean {
  const lastProgress = Date.parse(
    site.last_progress_at ?? site.updated_at ?? site.created_at,
  );
  return Date.now() - lastProgress > WATCHDOG_STALL_MS;
}

async function watchdog(site: SiteRow): Promise<boolean> {
  if (inflight.has(site.id)) return false; // work is genuinely running here
  if (!isStale(site)) return false;

  await updateSite(site.id, {
    status: "failed",
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

/** Preview link only counts when the dev server actually answers. */
async function probePreviewIfNeeded(site: SiteRow): Promise<void> {
  if (!site.sandbox_preview_url || site.preview_ready) return;
  if (!isActiveStatus(site.status)) return;
  try {
    const response = await fetch(site.sandbox_preview_url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(3_000),
    });
    // anything the dev server answers (2xx-4xx) counts as "up"
    if (response.status < 500) {
      await updateSite(site.id, { preview_ready: true });
      await addEvent(
        site.id,
        `Dev server respondendo — preview liberado: ${site.sandbox_preview_url}`,
      );
    }
  } catch {
    // still down — keep hidden
  }
}

async function keepaliveIfNeeded(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (!site.sandbox_handle) return;
  const isWorking =
    inflight.has(site.id) ||
    isMigratingStatus(site.status) ||
    isValidatingStatus(site.status);
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
 * Zombie-kill recovery: stale platform replicas (old builds keep Running
 * after every publish) claim sessions, fail them with legacy-protocol 404s
 * and write a hard `failed` with THEIR old code — so the in-phase auto-retry
 * never runs. Fresh workers sweep those corpses back to life, bounded by
 * no_improve_count.
 */
const ZOMBIE_FAILURE_SIGNATURE =
  /decopilot (stream|message dispatch|thread stream) failed \(404\)|organization .+ not found/i;
const MAX_ZOMBIE_REVIVES = 12;

async function reviveZombieKills(sites: SiteRow[]): Promise<void> {
  for (const site of sites) {
    // translate session phases written under the old names (zombie writes)
    // to the v2 names so stale replicas lose sight of them
    if (site.status === "migrating" || site.status === "validating") {
      const v2 = toV2Status(site.status);
      await updateSite(site.id, { status: v2 });
      site.status = v2;
      continue;
    }
    if (site.status !== "failed") continue;
    if (!site.error || !ZOMBIE_FAILURE_SIGNATURE.test(site.error)) continue;
    if (site.no_improve_count >= MAX_ZOMBIE_REVIVES) continue;

    const resumeInto =
      site.sandbox_handle && site.virtual_mcp_id
        ? "migrating2"
        : toV2Status((site.resume_status ?? "queued") as SiteRow["status"]);

    await updateSite(site.id, {
      status: resumeInto,
      error: null,
      no_improve_count: site.no_improve_count + 1,
      phase_detail: `revivido após falha de réplica desatualizada (${site.no_improve_count + 1}/${MAX_ZOMBIE_REVIVES})`,
      sandbox_session_id: null,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Falha de réplica desatualizada — retry automático ${site.no_improve_count + 1}/${MAX_ZOMBIE_REVIVES} (retomando em ${resumeInto})`,
      "warn",
    );
    site.status = resumeInto;
  }
}

async function tickConnection(ctx: WorkerCtx): Promise<void> {
  const sites = await listSites({ connectionId: ctx.connectionId });

  await reviveZombieKills(sites);

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
    const killed = await watchdog(site);
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

  // 3. advance + 4. keepalive
  for (const site of survivors) {
    await advanceSite(site, ctx);
    await keepaliveIfNeeded(site, ctx);
    await probePreviewIfNeeded(site);
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
  const rows = await loadAllConnections();
  let advanced = 0;
  for (const row of rows) {
    try {
      const stored = row.state?.[WORKER_VERSION_STATE_KEY];
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
      if (stored !== WORKER_VERSION) {
        await saveConnection({
          connectionId: row.connection_id,
          organizationId: row.organization_id,
          meshUrl: row.mesh_url,
          state: {
            ...(row.state ?? {}),
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
