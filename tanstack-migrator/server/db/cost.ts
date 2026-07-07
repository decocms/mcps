/**
 * COGS snapshot cache (sitemig_cost_snapshot). The Grafana query is expensive
 * and cost changes slowly, so we cache the per-site COGS for 12h and serve the
 * suggestions widget from the cache. All Grafana access goes through
 * `server/lib/grafana.ts` (fetchSiteCosts).
 */

import { requireSupabase } from "./client.ts";
import { fetchSiteCosts, isGrafanaConfigured } from "../lib/grafana.ts";
import type { WorkerCtx } from "../lib/mesh.ts";

const TTL_MS = 12 * 60 * 60_000;
/** Keep the cache bounded — the widget only shows the top handful anyway. */
const MAX_ROWS = 200;

export interface CostRow {
  site_name: string;
  cogs_usd: number;
  measured_at: string;
}

export async function getCostSnapshot(
  connectionId: string,
): Promise<CostRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_cost_snapshot")
    .select("site_name, cogs_usd, measured_at")
    .eq("connection_id", connectionId)
    .order("cogs_usd", { ascending: false });
  if (error) throw new Error(`Failed to read cost snapshot: ${error.message}`);
  return (data as CostRow[]) ?? [];
}

/** COGS for one site name (the "antes"), or null. */
export async function getSiteCost(
  connectionId: string,
  siteName: string,
): Promise<number | null> {
  const client = requireSupabase();
  const { data } = await client
    .from("sitemig_cost_snapshot")
    .select("cogs_usd")
    .eq("connection_id", connectionId)
    .eq("site_name", siteName)
    .maybeSingle();
  const v = (data as { cogs_usd: number } | null)?.cogs_usd;
  return typeof v === "number" ? v : null;
}

async function snapshotAgeMs(connectionId: string): Promise<number> {
  const client = requireSupabase();
  const { data } = await client
    .from("sitemig_cost_snapshot")
    .select("measured_at")
    .eq("connection_id", connectionId)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = (data as { measured_at: string } | null)?.measured_at;
  return at ? Date.now() - Date.parse(at) : Infinity;
}

/**
 * If the cache is older than 12h (or empty), pull fresh COGS from Grafana and
 * upsert. No-op when Grafana isn't configured or returns nothing. Best-effort:
 * a failed refresh leaves the stale cache in place.
 */
export async function refreshCostSnapshotIfStale(
  ctx: WorkerCtx,
  connectionId: string,
): Promise<void> {
  if (!isGrafanaConfigured(ctx)) return;
  if ((await snapshotAgeMs(connectionId)) < TTL_MS) return;

  const costs = await fetchSiteCosts(ctx);
  if (costs.length === 0) return;

  const now = new Date().toISOString();
  const rows = costs
    .sort((a, b) => b.cogsUsd - a.cogsUsd)
    .slice(0, MAX_ROWS)
    .map((c) => ({
      connection_id: connectionId,
      site_name: c.site,
      cogs_usd: c.cogsUsd,
      currency: "USD",
      measured_at: now,
    }));

  const client = requireSupabase();
  const { error } = await client
    .from("sitemig_cost_snapshot")
    .upsert(rows, { onConflict: "connection_id,site_name" });
  if (error)
    throw new Error(`Failed to upsert cost snapshot: ${error.message}`);
}
