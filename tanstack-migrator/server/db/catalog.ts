/**
 * Client for the decocms platform `sites` catalog (a DIFFERENT Supabase project
 * than the MCP's own sitemig_* DB).
 *
 * Mostly reads (register-modal repo autocomplete: search by site name to
 * pre-fill the GitHub repo + production URL, no GitHub API calls / no rate
 * limit). The ONE write is setSitePlatform — it flags the migrated -tanstack
 * repo as a Cloudflare Workers Builds site so the Fresh/Deno k8s deployer stops
 * watching it. Opt-in: active only when DECOCMS_SUPABASE_URL +
 * DECOCMS_SUPABASE_KEY (a service-role key) are set.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let catalogClient: SupabaseClient | null = null;

function getCatalogClient(): SupabaseClient | null {
  if (catalogClient) return catalogClient;
  const url = process.env.DECOCMS_SUPABASE_URL;
  const key = process.env.DECOCMS_SUPABASE_KEY;
  if (!url || !key) return null;
  try {
    catalogClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return catalogClient;
  } catch {
    return null;
  }
}

export function isCatalogConfigured(): boolean {
  return (
    !!process.env.DECOCMS_SUPABASE_URL && !!process.env.DECOCMS_SUPABASE_KEY
  );
}

export interface CatalogSite {
  name: string;
  /** "deco-sites/farmrio" (owner/repo), derived from github_repo_url. */
  repo: string | null;
  /** Best production URL from the domains array (custom domain preferred). */
  prodUrl: string | null;
  thumbUrl: string | null;
}

interface DomainEntry {
  domain?: string;
  production?: boolean;
  validated?: boolean;
}

/** github.com URL → "owner/repo" (null if it isn't a github repo url). */
function toOwnerRepo(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1].replace(/\.git$/, "") : null;
}

/**
 * Pick the production URL a human would call "the live site": a validated
 * custom domain beats *.deco.site / *.deno.dev; those beat non-production.
 */
function bestProdUrl(domains: unknown): string | null {
  if (!Array.isArray(domains)) return null;
  const prod = (domains as DomainEntry[]).filter(
    (d) => d?.production && typeof d.domain === "string",
  );
  if (prod.length === 0) return null;
  const isPlatform = (d: string) => /\.deco\.site|\.deno\.dev/i.test(d);
  const score = (d: DomainEntry): number => {
    let s = 0;
    if (!isPlatform(d.domain!)) s += 2; // custom domain
    if (d.validated) s += 1;
    return s;
  };
  const best = prod.sort((a, b) => score(b) - score(a))[0];
  return best?.domain?.replace(/\/$/, "") ?? null;
}

/**
 * Search the decocms catalog by site name. Returns [] when the catalog isn't
 * configured — callers fall back to the GitHub repo search.
 */
export async function searchSiteCatalog(
  query: string,
  limit = 8,
): Promise<CatalogSite[]> {
  const client = getCatalogClient();
  if (!client || !query.trim()) return [];

  const { data, error } = await client
    .from("sites")
    .select("name, full_name, github_repo_url, domains, thumb_url")
    .ilike("name", `%${query.trim()}%`)
    .order("name", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return (
    data as Array<{
      name: string;
      full_name: string | null;
      github_repo_url: string | null;
      domains: unknown;
      thumb_url: string | null;
    }>
  ).map((r) => ({
    name: r.full_name ?? r.name,
    repo: toOwnerRepo(r.github_repo_url),
    prodUrl: bestProdUrl(r.domains),
    thumbUrl: r.thumb_url ?? null,
  }));
}

/**
 * Look up catalog entries for a set of site names (Grafana `site` label). Returns
 * a Map keyed by BOTH `name` and `full_name` (lowercased) so callers can match on
 * either. Empty map when the catalog isn't configured.
 */
export async function catalogByNames(
  names: string[],
): Promise<Map<string, CatalogSite>> {
  const map = new Map<string, CatalogSite>();
  const client = getCatalogClient();
  const unique = [...new Set(names.filter(Boolean))];
  if (!client || unique.length === 0) return map;

  const { data, error } = await client
    .from("sites")
    .select("name, full_name, github_repo_url, domains, thumb_url")
    .in("name", unique);

  if (error || !data) return map;

  for (const r of data as Array<{
    name: string;
    full_name: string | null;
    github_repo_url: string | null;
    domains: unknown;
    thumb_url: string | null;
  }>) {
    const site: CatalogSite = {
      name: r.full_name ?? r.name,
      repo: toOwnerRepo(r.github_repo_url),
      prodUrl: bestProdUrl(r.domains),
      thumbUrl: r.thumb_url ?? null,
    };
    if (r.name) map.set(r.name.toLowerCase(), site);
    if (r.full_name) map.set(r.full_name.toLowerCase(), site);
  }
  return map;
}

export const CFWORKERS_BUILDS_PLATFORM = "cfworkers-builds";

/**
 * Flag a repo's catalog row with `metadata.platform` (default
 * "cfworkers-builds") so the deco Fresh/Deno k8s deployer stops watching the
 * migrated -tanstack repo (it keeps trying to deploy it and leaves a mess).
 *
 * Read-merge-write on the single row matched by github_repo_url — never clobbers
 * other metadata keys. Fully guarded + best-effort: returns {ok:false, reason}
 * instead of throwing (catalog not configured / row not indexed yet / RLS), so
 * it can never block a migration. Idempotent.
 */
export async function setSitePlatform(
  repoFull: string,
  platform: string = CFWORKERS_BUILDS_PLATFORM,
): Promise<{ ok: boolean; reason: string }> {
  const client = getCatalogClient();
  if (!client) return { ok: false, reason: "catalog not configured" };
  const repo = repoFull.trim().replace(/\.git$/, "");
  if (!repo.includes("/"))
    return { ok: false, reason: `invalid repo ${repoFull}` };

  try {
    const { data, error } = await client
      .from("sites")
      .select("github_repo_url, metadata")
      .ilike("github_repo_url", `%${repo}%`)
      .limit(5);
    if (error) return { ok: false, reason: error.message };
    const rows = (data ?? []) as Array<{
      github_repo_url: string | null;
      metadata: Record<string, unknown> | null;
    }>;
    // exact owner/repo match (ilike is fuzzy — avoid touching a similarly-named repo)
    const row = rows.find((r) => toOwnerRepo(r.github_repo_url) === repo);
    if (!row) return { ok: false, reason: "repo not in catalog yet" };

    const meta =
      row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    if (meta.platform === platform) return { ok: true, reason: "already set" };

    const { error: upErr } = await client
      .from("sites")
      .update({ metadata: { ...meta, platform } })
      .eq("github_repo_url", row.github_repo_url);
    if (upErr) return { ok: false, reason: upErr.message };
    return { ok: true, reason: "updated" };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
