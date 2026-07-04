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

import {
  LEASE_TTL_MS,
  TICK_INTERVAL_MS,
  WATCHDOG_STALL_MS,
} from "../constants.ts";
import { isSupabaseConfigured } from "../db/client.ts";
import { loadAllConnections } from "../db/connections.ts";
import { addEvent } from "../db/events.ts";
import {
  acquireLease,
  listSites,
  releaseLease,
  updateSite,
} from "../db/sites.ts";
import { ACTIVE_STATUSES, type SiteRow } from "../db/types.ts";
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

async function keepaliveIfNeeded(site: SiteRow, ctx: WorkerCtx): Promise<void> {
  if (!site.sandbox_handle) return;
  const isWorking =
    inflight.has(site.id) ||
    site.status === "migrating" ||
    site.status === "validating";
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

async function tickConnection(ctx: WorkerCtx): Promise<void> {
  const sites = await listSites({ connectionId: ctx.connectionId });

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
  }
}

export async function runTickOnce(): Promise<{
  connections: number;
  advanced: number;
}> {
  if (!isSupabaseConfigured()) return { connections: 0, advanced: 0 };
  const rows = await loadAllConnections();
  let advanced = 0;
  for (const row of rows) {
    try {
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
