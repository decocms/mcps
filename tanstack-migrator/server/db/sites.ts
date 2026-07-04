/** CRUD + queue/lease operations for sitemig_sites. */

import { requireSupabase } from "./client.ts";
import { ACTIVE_STATUSES, type SiteRow, type SiteStatus } from "./types.ts";

export interface RegisterSiteInput {
  connectionId: string;
  name: string;
  sourceRepo: string;
  sourceBranch?: string;
  prodUrl: string;
  targetRepo?: string;
  parityTarget?: number;
  maxIterations?: number;
  /** Register an already-finished migration (e.g. granadobr-tanstack). */
  status?: SiteStatus;
}

export async function insertSite(input: RegisterSiteInput): Promise<SiteRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_sites")
    .insert({
      connection_id: input.connectionId,
      name: input.name,
      source_repo: input.sourceRepo,
      source_branch: input.sourceBranch ?? "main",
      prod_url: input.prodUrl,
      target_repo: input.targetRepo ?? null,
      status: input.status ?? "queued",
      parity_target: input.parityTarget ?? 95,
      max_iterations: input.maxIterations ?? 8,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Site ${input.sourceRepo} is already registered`);
    }
    throw new Error(`Failed to register site: ${error.message}`);
  }
  return data as SiteRow;
}

export async function getSite(id: string): Promise<SiteRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_sites")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load site: ${error.message}`);
  return (data as SiteRow | null) ?? null;
}

export async function listSites(filter?: {
  connectionId?: string;
  statuses?: SiteStatus[];
}): Promise<SiteRow[]> {
  const client = requireSupabase();
  let query = client
    .from("sitemig_sites")
    .select("*")
    .order("created_at", { ascending: true });

  if (filter?.connectionId) {
    query = query.eq("connection_id", filter.connectionId);
  }
  if (filter?.statuses && filter.statuses.length > 0) {
    query = query.in("status", filter.statuses);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list sites: ${error.message}`);
  return (data as SiteRow[]) ?? [];
}

export async function updateSite(
  id: string,
  patch: Partial<SiteRow>,
): Promise<SiteRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_sites")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update site: ${error.message}`);
  return data as SiteRow;
}

/** Sites currently occupying a queue slot. */
export async function listActiveSites(): Promise<SiteRow[]> {
  return listSites({ statuses: ACTIVE_STATUSES });
}

export async function listQueuedSites(): Promise<SiteRow[]> {
  return listSites({ statuses: ["queued"] });
}

/**
 * Take (or renew) the per-site worker lease. Conditional update guarded by
 * lease expiry — if another pod holds a live lease, returns null and the
 * caller skips the site for this tick.
 */
export async function acquireLease(
  siteId: string,
  owner: string,
  ttlMs: number,
): Promise<SiteRow | null> {
  const client = requireSupabase();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs).toISOString();

  // Renew own lease first (common case).
  const renew = await client
    .from("sitemig_sites")
    .update({ lease_expires_at: expires, updated_at: now.toISOString() })
    .eq("id", siteId)
    .eq("lease_owner", owner)
    .select("*");
  if (renew.error) {
    throw new Error(`Failed to renew lease: ${renew.error.message}`);
  }
  if (renew.data && renew.data.length > 0) return renew.data[0] as SiteRow;

  // Steal free/expired leases.
  const claim = await client
    .from("sitemig_sites")
    .update({
      lease_owner: owner,
      lease_expires_at: expires,
      updated_at: now.toISOString(),
    })
    .eq("id", siteId)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .select("*");
  if (claim.error) {
    throw new Error(`Failed to acquire lease: ${claim.error.message}`);
  }
  if (claim.data && claim.data.length > 0) return claim.data[0] as SiteRow;

  return null;
}

/** Accrue a session's cost onto the site (read-modify-write; drift is fine). */
export async function incrementCost(
  siteId: string,
  delta: number | undefined,
): Promise<void> {
  if (!delta || !Number.isFinite(delta) || delta <= 0) return;
  const site = await getSite(siteId).catch(() => null);
  if (!site) return;
  await updateSite(siteId, {
    cost_total: Number(site.cost_total ?? 0) + delta,
  }).catch(() => {});
}

/** Hard delete — runs/events cascade via FK. Frees the source_repo unique slot. */
export async function deleteSite(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("sitemig_sites").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete site: ${error.message}`);
}

export async function releaseLease(
  siteId: string,
  owner: string,
): Promise<void> {
  const client = requireSupabase();
  await client
    .from("sitemig_sites")
    .update({ lease_owner: null, lease_expires_at: null })
    .eq("id", siteId)
    .eq("lease_owner", owner);
}
