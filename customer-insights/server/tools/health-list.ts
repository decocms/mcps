/**
 * Tool: CUSTOMER_HEALTH_LIST (customer_health_list)
 *
 * Returns a ranked list of all customers with a health score based on
 * payment behavior, usage trends, and overage metrics. Useful for
 * daily triage: "which customers need attention today?"
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { sanitize } from "./sanitize.ts";

import { round2, num } from "./utils.ts";

type RawRow = {
  id: unknown;
  name: unknown;
  email: unknown;
  total_invoices: unknown;
  paid_count: unknown;
  overdue_count: unknown;
  total_billed: unknown;
  overdue_amount: unknown;
  avg_amount: unknown;
  last_paid_date: unknown;
  avg_pageviews_recent: unknown;
  avg_pageviews_previous: unknown;
  overage_total: unknown;
  latest_plan: unknown;
};

type CustomerHealth = {
  id: number;
  name: string;
  email: string;
  health_score: number;
  health_label: "critical" | "at_risk" | "needs_attention" | "healthy" | "excellent";
  total_invoices: number;
  paid_count: number;
  overdue_count: number;
  total_billed: number;
  overdue_amount: number;
  avg_monthly: number;
  pageviews_trend_pct: number | null;
  overage_pct: number;
  latest_plan: string;
  issues: string[];
};

function isAttentionLabel(label: CustomerHealth["health_label"]): boolean {
  return label === "needs_attention" || label === "at_risk" || label === "critical";
}

// Computes a health score (0-100) for a single customer by applying penalty
// deductions to a starting score of 100. Each dimension has a maximum penalty
// so no single factor can tank the entire score by itself. Final score is
// clamped to [0, 100] to handle edge cases where penalties overlap.
function computeHealth(row: RawRow): CustomerHealth {
  const id = num(row.id);
  const name = String(row.name ?? "");
  const email = String(row.email ?? "");
  const totalInvoices = num(row.total_invoices);
  const paidCount = num(row.paid_count);
  const overdueCount = num(row.overdue_count);
  const totalBilled = num(row.total_billed);
  const overdueAmount = num(row.overdue_amount);
  const avgAmount = num(row.avg_amount);
  const pvRecent = num(row.avg_pageviews_recent);
  const pvPrevious = num(row.avg_pageviews_previous);
  const overageTotal = num(row.overage_total);
  const latestPlan = String(row.latest_plan ?? "unknown");

  const issues: string[] = [];
  let score = 100;

  // ── Dimension 1: Payment behavior (max -40 points) ───────────────────────
  // paymentRate = fraction of invoices that were paid.
  // Below 50% → severe penalty (-40). Between 50-80% → moderate (-20).
  if (totalInvoices > 0) {
    const paymentRate = paidCount / totalInvoices;
    if (paymentRate < 0.5) {
      score -= 40;
      issues.push(`Low payment rate: ${round2(paymentRate * 100)}%`);
    } else if (paymentRate < 0.8) {
      score -= 20;
      issues.push(`Below-average payment rate: ${round2(paymentRate * 100)}%`);
    }
  }

  // ── Dimension 2: Overdue invoices (max -30 points) ───────────────────────
  // Each overdue invoice costs 10 points, capped at 30 so a single bad month
  // doesn't make the customer look catastrophically worse than three bad months.
  if (overdueCount > 0) {
    const penalty = Math.min(30, overdueCount * 10);
    score -= penalty;
    issues.push(`${overdueCount} overdue invoice(s) totaling R$${round2(overdueAmount).toFixed(2)}`);
  }

  // ── Dimension 3: Usage trend (max -20 points) ─────────────────────────────
  // Compares avg pageviews in the last 3 months vs the 3 months before that.
  // A >25% drop signals potential churn. When there's no previous data yet
  // (new customer), we treat it as 100% growth — no penalty.
  let pageviewsTrendPct: number | null = null;
  if (pvPrevious > 0) {
    pageviewsTrendPct = round2(((pvRecent - pvPrevious) / pvPrevious) * 100);
    if (pageviewsTrendPct < -25) {
      const penalty = Math.min(20, Math.abs(pageviewsTrendPct) / 5);
      score -= penalty;
      issues.push(`Pageviews dropped ${Math.abs(pageviewsTrendPct)}%`);
    }
  } else if (pvRecent > 0) {
    pageviewsTrendPct = 100; // first period — no comparison available
  }

  // ── Dimension 4: Overage percentage (max -10 points) ─────────────────────
  // High overage means the customer pays much more than their base plan, which
  // signals either wasteful usage or a need to upgrade. Both create friction.
  const overagePct = totalBilled > 0 ? round2((overageTotal / totalBilled) * 100) : 0;
  if (overagePct > 40) {
    score -= 10;
    issues.push(`High overage: ${overagePct}% of billing`);
  }

  // Clamp so rounding or overlapping penalties don't escape the [0, 100] range.
  score = Math.max(0, Math.min(100, score));

  // Map numeric score to a label for easy filtering and display.
  let healthLabel: CustomerHealth["health_label"];
  if (score >= 90) healthLabel = "excellent";
  else if (score >= 70) healthLabel = "healthy";
  else if (score >= 50) healthLabel = "needs_attention";
  else if (score >= 30) healthLabel = "at_risk";
  else healthLabel = "critical";

  return {
    id,
    name,
    email,
    health_score: score,
    health_label: healthLabel,
    total_invoices: totalInvoices,
    paid_count: paidCount,
    overdue_count: overdueCount,
    total_billed: round2(totalBilled),
    overdue_amount: round2(overdueAmount),
    avg_monthly: round2(avgAmount),
    pageviews_trend_pct: pageviewsTrendPct,
    overage_pct: overagePct,
    latest_plan: latestPlan,
    issues,
  };
}

export const createHealthListTool = (_env: Env) =>
  createPrivateTool({
    id: "customer_health_list",
    description:
      "Returns a ranked list of all customers with health scores (0-100) based on payment behavior, usage trends, and overage. Useful for daily triage.",

    inputSchema: z.object({
      sort_by: z.enum(["health_score", "overdue_amount", "overage_pct"]).default("health_score")
        .describe("Sort field. Default: health_score (worst first)."),
      min_invoices: z.preprocess(
        (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
        z.coerce.number().int().min(0).default(1),
      ).describe("Minimum number of invoices to include a customer (default: 1)."),
      health_filter: z.enum(["all", "critical", "at_risk", "needs_attention", "healthy", "excellent"]).default("all")
        .describe("Filter by health label. Default: all. Note: needs_attention includes critical and at_risk by default (triage mode)."),
      strict_health_filter: z.boolean().default(false)
        .describe("When true, applies exact health_filter match. Default false enables triage mode for needs_attention."),
      limit: z.preprocess(
        (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
        z.coerce.number().int().min(1).max(500).default(50),
      ).describe("Maximum number of customers returned (default: 50)."),
    }),

    outputSchema: z.object({
      total_customers: z.number(),
      returned: z.number(),
      distribution: z.any(),
      customers: z.array(z.any()),
      _meta: z.any().optional(),
    }),

    execute: async ({ context }) => {
      // Single query using three CTEs to gather all data in one round-trip:
      // - customer_billing: aggregates billing metrics per customer
      // - usage_trend: computes avg pageviews for recent vs previous 3-month windows
      //   using ROW_NUMBER() to rank invoices by recency per customer
      // - latest_plan: picks the most recent plan name per customer
      // All three are then joined together in the final SELECT.
      const rows = await query<RawRow>(
        `WITH customer_billing AS (
          SELECT
            b.id,
            c.name,
            c.email,
            COUNT(*) AS total_invoices,
            COUNT(CASE WHEN LOWER(b.status) = 'paid' THEN 1 END) AS paid_count,
            COUNT(CASE WHEN LOWER(b.status) != 'paid' THEN 1 END) AS overdue_count,
            COALESCE(SUM(b.amount), 0) AS total_billed,
            COALESCE(SUM(CASE WHEN LOWER(b.status) != 'paid' THEN b.amount ELSE 0 END), 0) AS overdue_amount,
            COALESCE(AVG(b.amount), 0) AS avg_amount,
            MAX(CASE WHEN LOWER(b.status) = 'paid' THEN b.paid_date END) AS last_paid_date,
            COALESCE(SUM(COALESCE(b.extra_pageviews_price, 0) + COALESCE(b.extra_req_price, 0) + COALESCE(b.extra_bw_price, 0)), 0) AS overage_total
          FROM v_billing b
          INNER JOIN v_customer_contacts c ON c.id = b.id
          GROUP BY b.id, c.name, c.email
          HAVING COUNT(*) >= ${context.min_invoices}
        ),
        usage_trend AS (
          SELECT
            id,
            COALESCE(AVG(CASE WHEN rn <= 3 THEN pageviews END), 0) AS avg_pageviews_recent,
            COALESCE(AVG(CASE WHEN rn > 3 AND rn <= 6 THEN pageviews END), 0) AS avg_pageviews_previous
          FROM (
            SELECT id, pageviews, ROW_NUMBER() OVER (PARTITION BY id ORDER BY reference_month DESC) AS rn
            FROM v_billing
          ) sub
          WHERE rn <= 6
          GROUP BY id
        ),
        latest_plan AS (
          SELECT id, plan AS latest_plan
          FROM (
            SELECT id, plan, ROW_NUMBER() OVER (PARTITION BY id ORDER BY reference_month DESC) AS rn
            FROM v_billing
          ) sub
          WHERE rn = 1
        )
        SELECT
          cb.*,
          COALESCE(ut.avg_pageviews_recent, 0) AS avg_pageviews_recent,
          COALESCE(ut.avg_pageviews_previous, 0) AS avg_pageviews_previous,
          COALESCE(lp.latest_plan, 'unknown') AS latest_plan
        FROM customer_billing cb
        LEFT JOIN usage_trend ut ON ut.id = cb.id
        LEFT JOIN latest_plan lp ON lp.id = cb.id`,
      );

      const allCustomers = rows.map(computeHealth);

      // "needs_attention" in triage mode (default) expands to include "at_risk"
      // and "critical" — so asking for customers that need attention returns ALL
      // problematic customers, not just the middle tier.
      const triageNeedsAttention = context.health_filter === "needs_attention" && !context.strict_health_filter;
      const filtered = context.health_filter === "all"
        ? allCustomers
        : triageNeedsAttention
        ? allCustomers.filter((c) => isAttentionLabel(c.health_label))
        : allCustomers.filter((c) => c.health_label === context.health_filter);

      // Sort worst-first for health_score (ascending), highest-first for the others.
      const sortField = context.sort_by;
      filtered.sort((a, b) => {
        if (sortField === "health_score") return a.health_score - b.health_score; // worst first
        if (sortField === "overdue_amount") return b.overdue_amount - a.overdue_amount;
        if (sortField === "overage_pct") return b.overage_pct - a.overage_pct;
        return 0;
      });

      // Count how many customers fall into each health bucket before applying
      // the limit, so the caller can see the full distribution even when only
      // a subset is returned.
      const distribution: Record<string, number> = {
        excellent: 0,
        healthy: 0,
        needs_attention: 0,
        at_risk: 0,
        critical: 0,
      };
      for (const c of allCustomers) {
        distribution[c.health_label]++;
      }

      const limited = filtered.slice(0, context.limit);

      return sanitize({
        total_customers: allCustomers.length,
        returned: limited.length,
        distribution,
        customers: limited,
        _meta: {
          applied_health_filter: context.health_filter,
          strict_health_filter: context.strict_health_filter,
          triage_mode: triageNeedsAttention,
          note: triageNeedsAttention
            ? "needs_attention expanded to include critical and at_risk."
            : undefined,
        },
      });
    },
  });
