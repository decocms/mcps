/**
 * Read-only client for the decocms platform `sites` catalog (a DIFFERENT
 * Supabase project than the MCP's own sitemig_* DB).
 *
 * Powers the register modal's repo autocomplete: search by site name and
 * pre-fill both the GitHub repo and the production URL — no GitHub API calls,
 * so no rate limit. Opt-in: only active when DECOCMS_SUPABASE_URL +
 * DECOCMS_SUPABASE_KEY are set. This module ONLY ever runs SELECTs.
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
