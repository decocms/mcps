/**
 * Per-site COGS (cost of goods sold / infra cost) from Grafana, read through the
 * bound GRAFANA MCP (self-hosted). This is the ONLY place that talks to Grafana —
 * `server/db/cost.ts` caches the result and the rest of the app reads the cache.
 *
 * Degrades gracefully: returns [] when the GRAFANA binding or COGS_PROMQL isn't
 * configured, so the suggestions feature simply shows nothing until it's set up.
 */

import { parseMigratorConfig } from "../types/env.ts";
import { callBindingTool, hasBinding, type WorkerCtx } from "./mesh.ts";

export interface SiteCost {
  site: string;
  cogsUsd: number;
}

export function isGrafanaConfigured(ctx: WorkerCtx): boolean {
  const cfg = parseMigratorConfig(ctx.state);
  return hasBinding(ctx, "GRAFANA") && !!cfg.cogsPromql;
}

/**
 * Parse a Grafana `/api/ds/query` instant-vector response (dataframe format)
 * into {site, cogsUsd}. Each frame carries labels on a value field; we read the
 * `site` label and the last numeric value. Tolerant of shape drift → best effort.
 */
export function parseInstantVector(result: unknown): SiteCost[] {
  const out: SiteCost[] = [];
  const frames =
    (
      result as {
        results?: Record<string, { frames?: unknown[] }>;
      }
    )?.results ?? {};
  for (const refId of Object.keys(frames)) {
    const frameList = frames[refId]?.frames ?? [];
    for (const frame of frameList as Array<{
      schema?: {
        fields?: Array<{ labels?: Record<string, string>; type?: string }>;
      };
      data?: { values?: unknown[][] };
    }>) {
      const fields = frame.schema?.fields ?? [];
      const values = frame.data?.values ?? [];
      // find the value field (numeric, carries labels) and its column index
      const valueIdx = fields.findIndex(
        (f) => f?.type === "number" && f?.labels && "site" in (f.labels ?? {}),
      );
      if (valueIdx < 0) continue;
      const site = fields[valueIdx].labels?.site;
      const col = values[valueIdx] as number[] | undefined;
      if (!site || !col || col.length === 0) continue;
      const last = Number(col[col.length - 1]);
      if (Number.isFinite(last)) out.push({ site, cogsUsd: last });
    }
  }
  return out;
}

/** Fetch per-site monthly COGS via the bound Grafana MCP. Empty when unconfigured. */
export async function fetchSiteCosts(ctx: WorkerCtx): Promise<SiteCost[]> {
  const cfg = parseMigratorConfig(ctx.state);
  if (!hasBinding(ctx, "GRAFANA") || !cfg.cogsPromql) return [];
  try {
    const { result } = await callBindingTool<{ result: unknown }>(
      ctx,
      "GRAFANA",
      "GRAFANA_QUERY_PROMETHEUS",
      {
        expr: cfg.cogsPromql,
        datasourceUid: cfg.grafanaDatasourceUid,
        instant: true,
      },
      60_000,
    );
    return parseInstantVector(result);
  } catch {
    return [];
  }
}
