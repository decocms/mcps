/**
 * Tool: CUSTOMER_USAGE_GET (customer_usage_get)
 *
 * Returns usage data over time for a customer including pageviews, requests,
 * bandwidth (with human-readable formatting), efficiency ratios (Request/Pageview,
 * BW/10kPageview), percentage changes (recent 3m vs previous 3m), and automatic
 * anomaly detection (high request ratio, heavy assets, usage drop, usage spike).
 * Data source: v_billing view (monthly usage fields from CSV).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize, sanitizeRows } from "./sanitize.ts";

import { clean, toDateOnly, round2 } from "./utils.ts";

function changePct(recent: number, previous: number): number | null {
  if (previous === 0) return recent > 0 ? 100 : null;
  return round2(((recent - previous) / previous) * 100);
}

function formatBandwidth(bwGb: number): string {
  if (bwGb >= 1000) return `${round2(bwGb / 1000)}TB`;
  return `${round2(bwGb)}GB`;
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${round2(n / 1_000_000)}M`;
  if (n >= 1_000) return `${round2(n / 1_000)}K`;
  return String(Math.round(n));
}

type Anomaly = {
  type: string;
  severity: "warning" | "critical";
  message: string;
  detail: string;
};

export const createUsageTool = (_env: Env) =>
  createPrivateTool({
    id: "customer_usage_get",
    description:
      "Returns customer usage history with pageviews, requests, bandwidth, efficiency ratios, percentage changes, and anomaly detection.",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("Numeric customer ID (recommended, unique). E.g.: 1108. Takes priority over customer_name if provided."),
      customer_name: z.string().optional()
        .describe("Customer name (exact and partial search). E.g.: Acme Corp. Warning: names are not unique — prefer customer_id."),
      months: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(60).default(12),
      ).describe("Number of most recent months to return (default: 12, max: 60)."),
      start_reference_month: z.string().optional()
        .describe("Start reference month filter. Format: YYYY-MM-DD. E.g.: 2024-01-01"),
      end_reference_month: z.string().optional()
        .describe("End reference month filter. Format: YYYY-MM-DD. E.g.: 2024-12-31"),
    }),

    outputSchema: z.object({
      customer: z.any(),
      match_type: z.enum(["id", "exact", "partial"]),
      total_points: z.number(),
      usage_history: z.array(z.any()),
      summary: z.any(),
      summary_text: z.string(),
      trend: z.object({
        avg_pageviews_recent_3m: z.number(),
        avg_pageviews_previous_3m: z.number(),
        avg_requests_recent_3m: z.number(),
        avg_requests_previous_3m: z.number(),
        avg_bandwidth_recent_3m: z.number(),
        avg_bandwidth_previous_3m: z.number(),
        pageviews_change_pct: z.number().nullable(),
        requests_change_pct: z.number().nullable(),
        bandwidth_change_pct: z.number().nullable(),
      }),
      efficiency: z.object({
        latest_request_pageview_ratio: z.number().nullable(),
        latest_bw_per_10k_pageview: z.number().nullable(),
        avg_request_pageview_ratio: z.number().nullable(),
        avg_bw_per_10k_pageview: z.number().nullable(),
      }),
      anomalies: z.array(z.object({
        type: z.string(),
        severity: z.enum(["warning", "critical"]),
        message: z.string(),
        detail: z.string(),
      })),
      _llm_instruction: z.string(),
      _meta: z.any(),
    }),

    execute: async ({ context }) => {
      const resolved = await resolveCustomer({
        customer_id: clean(context.customer_id),
        customer_name: clean(context.customer_name),
      });

      const conditions = [`id = ${resolved.customer.id}`];

      const startRef = toDateOnly(clean(context.start_reference_month));
      if (startRef) {
        conditions.push(`reference_month >= '${startRef}'`);
      }

      const endRef = toDateOnly(clean(context.end_reference_month));
      if (endRef) {
        conditions.push(`reference_month <= '${endRef}'`);
      }

      const whereClause = conditions.join(" AND ");

      const usageRows = await query(
        `WITH filtered AS (
          SELECT
            reference_month,
            pageviews,
            requests,
            bandwidth,
            plan,
            request_pageview_ratio,
            bw_per_10k_pageview
          FROM v_billing
          WHERE ${whereClause}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY reference_month DESC) AS rn
          FROM filtered
        )
        SELECT
          reference_month,
          pageviews,
          requests,
          bandwidth,
          plan,
          request_pageview_ratio,
          bw_per_10k_pageview
        FROM ranked
        WHERE rn <= ${context.months}
        ORDER BY reference_month DESC`,
      );

      const history = sanitizeRows(usageRows as Record<string, unknown>[]);

      for (const entry of history) {
        const bw = typeof entry.bandwidth === "number" ? entry.bandwidth : 0;
        entry.bandwidth_formatted = formatBandwidth(bw);
        const pv = typeof entry.pageviews === "number" ? entry.pageviews : 0;
        entry.pageviews_formatted = formatLargeNumber(pv);
        const rq = typeof entry.requests === "number" ? entry.requests : 0;
        entry.requests_formatted = formatLargeNumber(rq);
      }

      const [summaryRow] = await query(
        `WITH filtered AS (
          SELECT reference_month, pageviews, requests, bandwidth
          FROM v_billing
          WHERE ${whereClause}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY reference_month DESC) AS rn
          FROM filtered
        ),
        limited AS (
          SELECT reference_month, pageviews, requests, bandwidth
          FROM ranked
          WHERE rn <= ${context.months}
        )
        SELECT
          COALESCE(SUM(pageviews), 0) AS total_pageviews,
          COALESCE(SUM(requests), 0) AS total_requests,
          COALESCE(SUM(bandwidth), 0) AS total_bandwidth,
          COUNT(*) AS total_months
        FROM limited`,
      );

      const summaryRaw = sanitize((summaryRow ?? {}) as Record<string, unknown>);
      const totalBw = typeof summaryRaw.total_bandwidth === "number" ? summaryRaw.total_bandwidth : 0;
      const totalPv = typeof summaryRaw.total_pageviews === "number" ? summaryRaw.total_pageviews : 0;
      const totalRq = typeof summaryRaw.total_requests === "number" ? summaryRaw.total_requests : 0;
      summaryRaw.total_bandwidth_formatted = formatBandwidth(totalBw);
      summaryRaw.total_pageviews_formatted = formatLargeNumber(totalPv);
      summaryRaw.total_requests_formatted = formatLargeNumber(totalRq);

      const [trendRow] = await query(
        `WITH filtered AS (
          SELECT
            reference_month,
            pageviews,
            requests,
            bandwidth
          FROM v_billing
          WHERE ${whereClause}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY reference_month DESC) AS rn
          FROM filtered
        ),
        limited AS (
          SELECT reference_month, pageviews, requests, bandwidth
          FROM ranked
          WHERE rn <= ${context.months}
        ),
        trend_ranked AS (
          SELECT
            pageviews,
            requests,
            bandwidth,
            ROW_NUMBER() OVER (ORDER BY reference_month DESC) AS rn
          FROM limited
        )
        SELECT
          COALESCE(ROUND(AVG(CASE WHEN rn <= 3 THEN pageviews END)), 0) AS avg_pageviews_recent_3m,
          COALESCE(ROUND(AVG(CASE WHEN rn > 3 AND rn <= 6 THEN pageviews END)), 0) AS avg_pageviews_previous_3m,
          COALESCE(ROUND(AVG(CASE WHEN rn <= 3 THEN requests END)), 0) AS avg_requests_recent_3m,
          COALESCE(ROUND(AVG(CASE WHEN rn > 3 AND rn <= 6 THEN requests END)), 0) AS avg_requests_previous_3m,
          COALESCE(ROUND(AVG(CASE WHEN rn <= 3 THEN bandwidth END)::NUMERIC, 2), 0) AS avg_bandwidth_recent_3m,
          COALESCE(ROUND(AVG(CASE WHEN rn > 3 AND rn <= 6 THEN bandwidth END)::NUMERIC, 2), 0) AS avg_bandwidth_previous_3m
        FROM trend_ranked
        WHERE rn <= 6`,
      );

      const tr = sanitize((trendRow ?? {}) as Record<string, unknown>);
      const pvRecent = Number(tr.avg_pageviews_recent_3m ?? 0);
      const pvPrev = Number(tr.avg_pageviews_previous_3m ?? 0);
      const rqRecent = Number(tr.avg_requests_recent_3m ?? 0);
      const rqPrev = Number(tr.avg_requests_previous_3m ?? 0);
      const bwRecent = Number(tr.avg_bandwidth_recent_3m ?? 0);
      const bwPrev = Number(tr.avg_bandwidth_previous_3m ?? 0);

      const trend = {
        avg_pageviews_recent_3m: pvRecent,
        avg_pageviews_previous_3m: pvPrev,
        avg_requests_recent_3m: rqRecent,
        avg_requests_previous_3m: rqPrev,
        avg_bandwidth_recent_3m: bwRecent,
        avg_bandwidth_previous_3m: bwPrev,
        pageviews_change_pct: changePct(pvRecent, pvPrev),
        requests_change_pct: changePct(rqRecent, rqPrev),
        bandwidth_change_pct: changePct(bwRecent, bwPrev),
      };

      const latestRatio = history.length > 0
        ? (typeof history[0].request_pageview_ratio === "number" ? history[0].request_pageview_ratio : null)
        : null;
      const latestBwRatio = history.length > 0
        ? (typeof history[0].bw_per_10k_pageview === "number" ? history[0].bw_per_10k_pageview : null)
        : null;

      let ratioSum = 0, ratioCount = 0;
      let bwRatioSum = 0, bwRatioCount = 0;
      for (const entry of history) {
        if (typeof entry.request_pageview_ratio === "number") {
          ratioSum += entry.request_pageview_ratio;
          ratioCount++;
        }
        if (typeof entry.bw_per_10k_pageview === "number") {
          bwRatioSum += entry.bw_per_10k_pageview;
          bwRatioCount++;
        }
      }

      const efficiency = {
        latest_request_pageview_ratio: latestRatio,
        latest_bw_per_10k_pageview: latestBwRatio,
        avg_request_pageview_ratio: ratioCount > 0 ? round2(ratioSum / ratioCount) : null,
        avg_bw_per_10k_pageview: bwRatioCount > 0 ? round2(bwRatioSum / bwRatioCount) : null,
      };

      const anomalies: Anomaly[] = [];

      if (latestRatio !== null && latestRatio > 20) {
        anomalies.push({
          type: "high_request_ratio",
          severity: latestRatio > 50 ? "critical" : "warning",
          message: "Possible bot attack or caching issue",
          detail: `Request/Pageview ratio is ${latestRatio} (normal: < 20). This may indicate bot traffic, misconfigured caching, or excessive API calls per page.`,
        });
      }

      if (trend.bandwidth_change_pct !== null && trend.pageviews_change_pct !== null) {
        const bwGrew = trend.bandwidth_change_pct > 15;
        const pvStable = trend.pageviews_change_pct < 5;
        if (bwGrew && pvStable) {
          anomalies.push({
            type: "heavy_assets",
            severity: trend.bandwidth_change_pct > 40 ? "critical" : "warning",
            message: "Heavy assets detected",
            detail: `Bandwidth grew ${trend.bandwidth_change_pct}% but pageviews only changed ${trend.pageviews_change_pct}%. The customer may be serving heavier content (unoptimized images, videos) inflating bandwidth costs.`,
          });
        }
      }

      if (trend.pageviews_change_pct !== null && trend.pageviews_change_pct < -25) {
        anomalies.push({
          type: "usage_drop",
          severity: trend.pageviews_change_pct < -50 ? "critical" : "warning",
          message: "Significant usage decline detected",
          detail: `Pageviews dropped ${Math.abs(trend.pageviews_change_pct)}% comparing recent 3 months vs previous 3 months. This may indicate customer disengagement or migration.`,
        });
      }

      if (trend.pageviews_change_pct !== null && trend.pageviews_change_pct > 50) {
        anomalies.push({
          type: "usage_spike",
          severity: "warning",
          message: "Significant usage increase",
          detail: `Pageviews grew ${trend.pageviews_change_pct}% comparing recent 3 months vs previous 3 months. Customer may need a tier upgrade to avoid excessive overage costs.`,
        });
      }

      const refMonths = history
        .map((entry) => String(entry.reference_month ?? ""))
        .filter(Boolean)
        .sort();
      const periodStart = refMonths.length > 0 ? refMonths[0] : null;
      const periodEnd = refMonths.length > 0 ? refMonths[refMonths.length - 1] : null;
      const summaryText =
        `Uso agregado em ${summaryRaw.total_months ?? history.length} mês(es) ` +
        `(${periodStart ?? "N/A"} a ${periodEnd ?? "N/A"}): ` +
        `Pageviews ${summaryRaw.total_pageviews_formatted}, ` +
        `Requests ${summaryRaw.total_requests_formatted}, ` +
        `Bandwidth ${summaryRaw.total_bandwidth_formatted}.`;
      const llmInstruction =
        `Os valores de summary/trend consideram exatamente os mesmos meses retornados em usage_history (months=${context.months}). ` +
        `Não misture com períodos maiores/menores. Copie summary_text literalmente quando resumir totais.`;

      return sanitize({
        customer: resolved.customer,
        match_type: resolved.match_type,
        total_points: history.length,
        usage_history: history,
        summary: summaryRaw,
        summary_text: summaryText,
        trend,
        efficiency,
        anomalies,
        _llm_instruction: llmInstruction,
        _meta: {
          months_requested: context.months,
          months_returned: history.length,
          summary_months: summaryRaw.total_months ?? history.length,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
    },
  });
