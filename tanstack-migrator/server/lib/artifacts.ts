/**
 * Parity report artifacts on object storage (OBJECT_STORAGE binding).
 *
 * The MCP pre-mints presigned PUT URLs and hands them to the sandbox session,
 * which curls report.html / report.json / heatmaps up after each parity run.
 * The UI later gets presigned GET URLs via the PARITY_REPORT_URLS tool.
 * No storage credentials ever enter the sandbox.
 */

import { ARTIFACT_ROOT } from "../constants.ts";
import type { ParitySummary } from "../db/types.ts";
import { callBindingTool, hasBinding, type WorkerCtx } from "./mesh.ts";

export const HEATMAP_SLOTS = 6;

export interface ArtifactKeys {
  prefix: string;
  reportHtml: string;
  reportJson: string;
  heatmaps: string[];
}

export function artifactKeys(siteId: string, runId: string): ArtifactKeys {
  const prefix = `${ARTIFACT_ROOT}/${siteId}/runs/${runId}`;
  return {
    prefix,
    reportHtml: `${prefix}/report.html`,
    reportJson: `${prefix}/report.json`,
    heatmaps: Array.from(
      { length: HEATMAP_SLOTS },
      (_, i) => `${prefix}/heatmap_${i}.png`,
    ),
  };
}

async function presign(
  ctx: WorkerCtx,
  kind: "GET_PRESIGNED_URL" | "PUT_PRESIGNED_URL",
  key: string,
  contentType?: string,
  expiresIn = 3600,
): Promise<string> {
  const result = await callBindingTool<{ url: string }>(
    ctx,
    "OBJECT_STORAGE",
    kind,
    { key, expiresIn, ...(contentType ? { contentType } : {}) },
  );
  if (!result?.url) throw new Error(`${kind} returned no url for ${key}`);
  return result.url;
}

export async function presignPutUrls(
  ctx: WorkerCtx,
  keys: ArtifactKeys,
): Promise<{
  reportHtmlPut: string;
  reportJsonPut: string;
  heatmapPuts: string[];
} | null> {
  if (!hasBinding(ctx, "OBJECT_STORAGE")) return null;
  const [reportHtmlPut, reportJsonPut, ...heatmapPuts] = await Promise.all([
    presign(ctx, "PUT_PRESIGNED_URL", keys.reportHtml, "text/html", 7200),
    presign(
      ctx,
      "PUT_PRESIGNED_URL",
      keys.reportJson,
      "application/json",
      7200,
    ),
    ...keys.heatmaps.map((key) =>
      presign(ctx, "PUT_PRESIGNED_URL", key, "image/png", 7200),
    ),
  ]);
  return { reportHtmlPut, reportJsonPut, heatmapPuts };
}

export async function presignGetUrls(
  ctx: WorkerCtx,
  prefix: string,
): Promise<{
  reportHtml: string;
  reportJson: string;
  heatmaps: Array<{ name: string; url: string }>;
}> {
  const keys: ArtifactKeys = {
    prefix,
    reportHtml: `${prefix}/report.html`,
    reportJson: `${prefix}/report.json`,
    heatmaps: Array.from(
      { length: HEATMAP_SLOTS },
      (_, i) => `${prefix}/heatmap_${i}.png`,
    ),
  };
  const [reportHtml, reportJson, ...heatmaps] = await Promise.all([
    presign(ctx, "GET_PRESIGNED_URL", keys.reportHtml),
    presign(ctx, "GET_PRESIGNED_URL", keys.reportJson),
    ...keys.heatmaps.map((key) => presign(ctx, "GET_PRESIGNED_URL", key)),
  ]);
  return {
    reportHtml,
    reportJson,
    heatmaps: heatmaps.map((url, i) => ({ name: `heatmap_${i}.png`, url })),
  };
}

/**
 * Long-lived presigned GETs for embedding in GitHub issue bodies
 * (![heatmap](url)). 7 days — images in old issues eventually expire;
 * regenerable via PARITY_REPORT_URLS.
 */
export async function presignIssueEmbeds(
  ctx: WorkerCtx,
  prefix: string,
): Promise<{ reportHtml: string; heatmaps: string[] } | null> {
  if (!hasBinding(ctx, "OBJECT_STORAGE")) return null;
  const week = 7 * 24 * 3600;
  try {
    const [reportHtml, ...heatmaps] = await Promise.all([
      presign(
        ctx,
        "GET_PRESIGNED_URL",
        `${prefix}/report.html`,
        undefined,
        week,
      ),
      ...Array.from({ length: HEATMAP_SLOTS }, (_, i) =>
        presign(
          ctx,
          "GET_PRESIGNED_URL",
          `${prefix}/heatmap_${i}.png`,
          undefined,
          week,
        ),
      ),
    ]);
    return { reportHtml, heatmaps };
  } catch {
    return null;
  }
}

/**
 * Fetch the uploaded report.json (via presigned GET) and trim it to the
 * summary stored in sitemig_runs (full report never goes to Postgres).
 */
export async function fetchReportSummary(
  ctx: WorkerCtx,
  prefix: string,
): Promise<ParitySummary | null> {
  if (!hasBinding(ctx, "OBJECT_STORAGE")) return null;
  try {
    const url = await presign(
      ctx,
      "GET_PRESIGNED_URL",
      `${prefix}/report.json`,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const report = (await response.json()) as Record<string, unknown>;
    return trimReportSummary(report);
  } catch {
    return null;
  }
}

export function trimReportSummary(
  report: Record<string, unknown>,
): ParitySummary {
  const verdict = report.verdict as ParitySummary["verdict"] | undefined;
  const visualDiff = report.visualDiff as
    | {
        parityOk?: boolean;
        results?: Array<Record<string, unknown>>;
      }
    | undefined;
  const topIssues = (report.topIssues as Array<Record<string, unknown>>) ?? [];

  return {
    verdict,
    parityOk: visualDiff?.parityOk,
    topIssues: topIssues.slice(0, 10).map((issue) => ({
      severity: String(issue.severity ?? "unknown"),
      category: issue.category ? String(issue.category) : undefined,
      page: issue.page ? String(issue.page) : undefined,
      summary: String(issue.summary ?? issue.details ?? ""),
      suggestedFix: issue.suggestedFix ? String(issue.suggestedFix) : undefined,
    })),
    perPage: (visualDiff?.results ?? []).slice(0, 20).map((r) => ({
      pagePath: String(r.pagePath ?? r.pageKey ?? "?"),
      viewport: r.viewport ? String(r.viewport) : undefined,
      pctDiff: typeof r.pctDiff === "number" ? r.pctDiff : undefined,
      verdict: r.verdict ? String(r.verdict) : undefined,
      sectionsOnlyInProd: Array.isArray(r.sectionsOnlyInProd)
        ? (r.sectionsOnlyInProd as string[]).slice(0, 10)
        : undefined,
    })),
  };
}
