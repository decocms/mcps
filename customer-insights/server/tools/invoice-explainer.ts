/**
 * Tool: CUSTOMER_INVOICE_EXPLAIN (customer_invoice_explain)
 *
 * Generates a detailed breakdown of a specific invoice for a customer,
 * showing base plan cost vs extras (pageviews, requests, bandwidth, seats,
 * support) with comparison to the previous month. Includes a human-readable
 * explanation text identifying cost drivers and anomalies.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize } from "./sanitize.ts";

import { toDateOnly as toIsoDate, clean, round2, num } from "./utils.ts";

type InvoiceRow = {
  due_date: unknown;
  amount: unknown;
  status: unknown;
  reference_month: unknown;
  paid_date: unknown;
  pageviews: unknown;
  requests: unknown;
  bandwidth: unknown;
  plan: unknown;
  request_pageview_ratio: unknown;
  bw_per_10k_pageview: unknown;
  extra_pageviews_price: unknown;
  extra_req_price: unknown;
  extra_bw_price: unknown;
  seats_builders: unknown;
  seats_builder_cost: unknown;
  support_price: unknown;
  tier_40_cost: unknown;
  tier_50_cost: unknown;
  tier_80_cost: unknown;
};

function formatBRL(value: number): string {
  return `R$${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / previous) * 100);
}

type InvoiceBreakdown = {
  reference_month: string;
  plan: string | null;
  total: number;
  base_plan: number;
  extras: {
    extra_pageviews: number;
    extra_requests: number;
    extra_bandwidth: number;
    seats_builder_cost: number;
    support_price: number;
    total_extras: number;
  };
  extras_percentage: number;
  usage: {
    pageviews: number;
    requests: number;
    bandwidth: number;
    request_pageview_ratio: number | null;
    bw_per_10k_pageview: number | null;
  };
  status: string;
  due_date: unknown;
  paid_date: unknown;
  seats_builders: number | null;
  tiering_simulation: {
    tier_40: number | null;
    tier_50: number | null;
    tier_80: number | null;
  };
};

function buildBreakdown(inv: InvoiceRow): InvoiceBreakdown {
  const amount = num(inv.amount);
  const extraPV = num(inv.extra_pageviews_price);
  const extraRQ = num(inv.extra_req_price);
  const extraBW = num(inv.extra_bw_price);
  const seatsCost = num(inv.seats_builder_cost);
  const supportPrice = num(inv.support_price);
  const totalExtras = extraPV + extraRQ + extraBW + seatsCost + supportPrice;
  const basePlan = round2(amount - totalExtras);
  const seatsBuilders = inv.seats_builders != null ? num(inv.seats_builders) : null;
  const reqPvRatio = inv.request_pageview_ratio != null ? num(inv.request_pageview_ratio) : null;
  const bwPer10k = inv.bw_per_10k_pageview != null ? num(inv.bw_per_10k_pageview) : null;
  const tier40 = inv.tier_40_cost != null ? num(inv.tier_40_cost) : null;
  const tier50 = inv.tier_50_cost != null ? num(inv.tier_50_cost) : null;
  const tier80 = inv.tier_80_cost != null ? num(inv.tier_80_cost) : null;

  return {
    reference_month: toIsoDate(inv.reference_month)?.slice(0, 7) ?? "",
    plan: inv.plan ? String(inv.plan) : null,
    total: round2(amount),
    base_plan: basePlan > 0 ? basePlan : 0,
    extras: {
      extra_pageviews: round2(extraPV),
      extra_requests: round2(extraRQ),
      extra_bandwidth: round2(extraBW),
      seats_builder_cost: round2(seatsCost),
      support_price: round2(supportPrice),
      total_extras: round2(totalExtras),
    },
    extras_percentage: amount > 0 ? round2((totalExtras / amount) * 100) : 0,
    usage: {
      pageviews: num(inv.pageviews),
      requests: num(inv.requests),
      bandwidth: num(inv.bandwidth),
      request_pageview_ratio: reqPvRatio,
      bw_per_10k_pageview: bwPer10k,
    },
    status: String(inv.status ?? ""),
    due_date: toIsoDate(inv.due_date),
    paid_date: toIsoDate(inv.paid_date),
    seats_builders: seatsBuilders,
    tiering_simulation: {
      tier_40: tier40 && tier40 > 0 ? round2(tier40) : null,
      tier_50: tier50 && tier50 > 0 ? round2(tier50) : null,
      tier_80: tier80 && tier80 > 0 ? round2(tier80) : null,
    },
  };
}

type Comparison = {
  amount_change_pct: number | null;
  amount_change_abs: number;
  direction: "increased" | "decreased" | "unchanged";
  details: {
    base_plan_change: number;
    extra_pageviews_change: number;
    extra_requests_change: number;
    extra_bandwidth_change: number;
    seats_change: number;
    support_change: number;
  };
  biggest_driver: string;
  biggest_driver_change: number;
};

function buildComparison(
  current: InvoiceBreakdown,
  previous: InvoiceBreakdown,
): Comparison {
  const amountChangePct = pctChange(current.total, previous.total);
  const amountChangeAbs = round2(current.total - previous.total);
  const direction = current.total > previous.total
    ? "increased" as const
    : current.total < previous.total
      ? "decreased" as const
      : "unchanged" as const;

  const details = {
    base_plan_change: round2(current.base_plan - previous.base_plan),
    extra_pageviews_change: round2(current.extras.extra_pageviews - previous.extras.extra_pageviews),
    extra_requests_change: round2(current.extras.extra_requests - previous.extras.extra_requests),
    extra_bandwidth_change: round2(current.extras.extra_bandwidth - previous.extras.extra_bandwidth),
    seats_change: round2(current.extras.seats_builder_cost - previous.extras.seats_builder_cost),
    support_change: round2(current.extras.support_price - previous.extras.support_price),
  };

  // Find the biggest cost driver
  const drivers: Array<{ name: string; change: number }> = [
    { name: "base_plan", change: Math.abs(details.base_plan_change) },
    { name: "extra_pageviews", change: Math.abs(details.extra_pageviews_change) },
    { name: "extra_requests", change: Math.abs(details.extra_requests_change) },
    { name: "extra_bandwidth", change: Math.abs(details.extra_bandwidth_change) },
    { name: "seats_builder", change: Math.abs(details.seats_change) },
    { name: "support", change: Math.abs(details.support_change) },
  ];
  drivers.sort((a, b) => b.change - a.change);
  const biggestDriver = drivers[0];

  return {
    amount_change_pct: amountChangePct,
    amount_change_abs: amountChangeAbs,
    direction,
    details,
    biggest_driver: biggestDriver.name,
    biggest_driver_change: biggestDriver.change,
  };
}

function buildExplanation(
  customerName: string,
  breakdown: InvoiceBreakdown,
  previousBreakdown: InvoiceBreakdown | null,
  comparison: Comparison | null,
): string {
  const lines: string[] = [];

  // ── Header
  lines.push(`Invoice Explanation: ${customerName} — ${breakdown.reference_month}`);
  lines.push("=".repeat(60));
  lines.push("");

  // ── Summary line
  const statusEmoji = breakdown.status.toLowerCase().includes("paid") ? "✅"
    : breakdown.status.toLowerCase().includes("overdue") ? "🔴"
    : "⏳";
  lines.push(`${statusEmoji} Total: ${formatBRL(breakdown.total)} | Status: ${breakdown.status} | Plan: ${breakdown.plan ?? "N/A"}`);
  lines.push("");

  // ── Cost Breakdown
  lines.push("Cost Breakdown:");
  lines.push(`  Base plan ............... ${formatBRL(breakdown.base_plan)}`);

  if (breakdown.extras.extra_pageviews > 0) {
    lines.push(`  Extra pageviews ........ ${formatBRL(breakdown.extras.extra_pageviews)}`);
  }
  if (breakdown.extras.extra_requests > 0) {
    lines.push(`  Extra requests ......... ${formatBRL(breakdown.extras.extra_requests)}`);
  }
  if (breakdown.extras.extra_bandwidth > 0) {
    lines.push(`  Extra bandwidth ........ ${formatBRL(breakdown.extras.extra_bandwidth)}`);
  }
  if (breakdown.extras.seats_builder_cost > 0) {
    lines.push(`  Seats/builders (${breakdown.seats_builders ?? "?"}) ... ${formatBRL(breakdown.extras.seats_builder_cost)}`);
  }
  if (breakdown.extras.support_price > 0) {
    lines.push(`  Support ................ ${formatBRL(breakdown.extras.support_price)}`);
  }

  lines.push(`  ${"─".repeat(40)}`);
  lines.push(`  Total extras ........... ${formatBRL(breakdown.extras.total_extras)} (${breakdown.extras_percentage}% of total)`);
  lines.push(`  TOTAL .................. ${formatBRL(breakdown.total)}`);
  lines.push("");

  // ── Usage metrics
  lines.push("Usage This Month:");
  lines.push(`  Pageviews: ${formatNumber(breakdown.usage.pageviews)}`);
  lines.push(`  Requests: ${formatNumber(breakdown.usage.requests)}`);
  lines.push(`  Bandwidth: ${breakdown.usage.bandwidth} GB`);
  if (breakdown.usage.request_pageview_ratio != null) {
    lines.push(`  Request/Pageview ratio: ${breakdown.usage.request_pageview_ratio}`);
  }
  if (breakdown.usage.bw_per_10k_pageview != null) {
    lines.push(`  BW per 10k pageviews: ${breakdown.usage.bw_per_10k_pageview}`);
  }
  lines.push("");

  // ── Payment info
  if (breakdown.due_date) {
    lines.push(`Due date: ${breakdown.due_date}`);
  }
  if (breakdown.paid_date) {
    lines.push(`Paid date: ${breakdown.paid_date}`);
  }
  lines.push("");

  // ── Comparison with previous month
  if (comparison && previousBreakdown) {
    lines.push(`Comparison vs Previous Month (${previousBreakdown.reference_month}):`);

    const arrow = comparison.direction === "increased" ? "📈"
      : comparison.direction === "decreased" ? "📉"
      : "➡️";
    const pctStr = comparison.amount_change_pct != null ? `${comparison.amount_change_pct > 0 ? "+" : ""}${comparison.amount_change_pct}%` : "N/A";
    const absStr = comparison.amount_change_abs >= 0 ? `+${formatBRL(comparison.amount_change_abs)}` : `-${formatBRL(Math.abs(comparison.amount_change_abs))}`;

    lines.push(`  ${arrow} Total ${comparison.direction}: ${absStr} (${pctStr})`);
    lines.push(`  Previous total: ${formatBRL(previousBreakdown.total)}`);
    lines.push("");

    // Show what changed
    const changes: Array<{ label: string; value: number }> = [];
    if (comparison.details.base_plan_change !== 0) {
      changes.push({ label: "Base plan", value: comparison.details.base_plan_change });
    }
    if (comparison.details.extra_pageviews_change !== 0) {
      changes.push({ label: "Extra pageviews", value: comparison.details.extra_pageviews_change });
    }
    if (comparison.details.extra_requests_change !== 0) {
      changes.push({ label: "Extra requests", value: comparison.details.extra_requests_change });
    }
    if (comparison.details.extra_bandwidth_change !== 0) {
      changes.push({ label: "Extra bandwidth", value: comparison.details.extra_bandwidth_change });
    }
    if (comparison.details.seats_change !== 0) {
      changes.push({ label: "Seats/builders", value: comparison.details.seats_change });
    }
    if (comparison.details.support_change !== 0) {
      changes.push({ label: "Support", value: comparison.details.support_change });
    }

    if (changes.length > 0) {
      lines.push("  Changes by component:");
      for (const c of changes) {
        const sign = c.value > 0 ? "+" : "";
        lines.push(`    ${c.label}: ${sign}${formatBRL(c.value)}`);
      }
      lines.push("");
    }

    // Usage comparison
    const pvChange = pctChange(breakdown.usage.pageviews, previousBreakdown.usage.pageviews);
    const reqChange = pctChange(breakdown.usage.requests, previousBreakdown.usage.requests);
    const bwChange = pctChange(breakdown.usage.bandwidth, previousBreakdown.usage.bandwidth);

    lines.push("  Usage changes:");
    lines.push(`    Pageviews: ${formatNumber(previousBreakdown.usage.pageviews)} → ${formatNumber(breakdown.usage.pageviews)} (${pvChange != null ? (pvChange > 0 ? "+" : "") + pvChange + "%" : "N/A"})`);
    lines.push(`    Requests: ${formatNumber(previousBreakdown.usage.requests)} → ${formatNumber(breakdown.usage.requests)} (${reqChange != null ? (reqChange > 0 ? "+" : "") + reqChange + "%" : "N/A"})`);
    lines.push(`    Bandwidth: ${previousBreakdown.usage.bandwidth} → ${breakdown.usage.bandwidth} GB (${bwChange != null ? (bwChange > 0 ? "+" : "") + bwChange + "%" : "N/A"})`);
    lines.push("");

    // Biggest driver alert
    if (comparison.biggest_driver_change > 0) {
      const driverLabels: Record<string, string> = {
        base_plan: "Base plan cost",
        extra_pageviews: "Extra pageviews charges",
        extra_requests: "Extra requests charges",
        extra_bandwidth: "Extra bandwidth charges",
        seats_builder: "Seats/builders cost",
        support: "Support cost",
      };
      lines.push(`💡 Main cost driver: ${driverLabels[comparison.biggest_driver] ?? comparison.biggest_driver} (${formatBRL(comparison.biggest_driver_change)} change)`);
      lines.push("");
    }
  }

  // ── Tiering simulation
  const { tier_40, tier_50, tier_80 } = breakdown.tiering_simulation;
  if (tier_40 != null || tier_50 != null || tier_80 != null) {
    lines.push("Tiering Simulation (what this invoice would cost on other plans):");
    if (tier_40 != null) {
      const diff = round2(breakdown.total - tier_40);
      const label = diff > 0 ? `saves ${formatBRL(diff)}` : diff < 0 ? `costs ${formatBRL(Math.abs(diff))} more` : "same";
      lines.push(`  R$40/10k PV: ${formatBRL(tier_40)} (${label})`);
    }
    if (tier_50 != null) {
      const diff = round2(breakdown.total - tier_50);
      const label = diff > 0 ? `saves ${formatBRL(diff)}` : diff < 0 ? `costs ${formatBRL(Math.abs(diff))} more` : "same";
      lines.push(`  R$50/10k PV: ${formatBRL(tier_50)} (${label})`);
    }
    if (tier_80 != null) {
      const diff = round2(breakdown.total - tier_80);
      const label = diff > 0 ? `saves ${formatBRL(diff)}` : diff < 0 ? `costs ${formatBRL(Math.abs(diff))} more` : "same";
      lines.push(`  R$80/10k PV: ${formatBRL(tier_80)} (${label})`);
    }
    lines.push("");
  }

  // ── Alerts
  const alerts: string[] = [];
  if (breakdown.extras_percentage > 40) {
    alerts.push(`⚠️ Extras represent ${breakdown.extras_percentage}% of total — consider plan upgrade.`);
  }
  if (comparison && comparison.amount_change_pct != null && comparison.amount_change_pct > 20) {
    alerts.push(`⚠️ Invoice increased ${comparison.amount_change_pct}% vs previous month.`);
  }
  if (comparison && comparison.amount_change_pct != null && comparison.amount_change_pct < -20) {
    alerts.push(`📉 Invoice decreased ${Math.abs(comparison.amount_change_pct)}% vs previous month — check for usage drop.`);
  }
  if (breakdown.status.toLowerCase().includes("overdue")) {
    alerts.push(`🔴 Invoice is OVERDUE.`);
  }

  if (alerts.length > 0) {
    lines.push("Alerts:");
    for (const alert of alerts) {
      lines.push(`  ${alert}`);
    }
  }

  return lines.join("\n");
}

export const createInvoiceExplainerTool = (_env: Env) =>
  createPrivateTool({
    id: "customer_invoice_explain",
    description:
      "Generates a detailed invoice breakdown for a specific month showing base plan vs extras (pageviews, requests, bandwidth, seats, support) with comparison to previous month.",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("Numeric customer ID (recommended, unique). E.g.: 1108."),
      customer_name: z.string().optional()
        .describe("Customer name (exact or partial search). E.g.: Paula. Warning: names are not unique — prefer customer_id."),
      reference_month: z.string()
        .describe("Month to explain. Format: YYYY-MM-DD or YYYY-MM. E.g.: 2025-11 or 2025-11-01"),
    }),

    outputSchema: z.object({
      customer: z.any(),
      match_type: z.enum(["id", "exact", "partial"]),
      invoice_found: z.boolean(),
      explanation: z.string().nullable(),
      breakdown: z.any().nullable(),
      previous_month: z.any().nullable(),
      comparison: z.any().nullable(),
    }),

    execute: async ({ context }) => {
      const resolved = await resolveCustomer({
        customer_id: clean(context.customer_id),
        customer_name: clean(context.customer_name),
      });

      // Normalize reference_month to YYYY-MM format
      let refMonth = context.reference_month.trim();
      if (refMonth.length === 7) refMonth = `${refMonth}-01`;

      const rows = await query<InvoiceRow>(
        `SELECT
          due_date, amount, status, reference_month, paid_date,
          pageviews, requests, bandwidth, plan,
          request_pageview_ratio, bw_per_10k_pageview,
          COALESCE(extra_pageviews_price, 0) AS extra_pageviews_price,
          COALESCE(extra_req_price, 0) AS extra_req_price,
          COALESCE(extra_bw_price, 0) AS extra_bw_price,
          seats_builders,
          COALESCE(seats_builder_cost, 0) AS seats_builder_cost,
          COALESCE(support_price, 0) AS support_price,
          COALESCE(tier_40_cost, 0) AS tier_40_cost,
          COALESCE(tier_50_cost, 0) AS tier_50_cost,
          COALESCE(tier_80_cost, 0) AS tier_80_cost
        FROM v_billing
        WHERE id = ${resolved.customer.id}
        ORDER BY reference_month DESC`,
      );

      if (rows.length === 0) {
        return sanitize({
          customer: resolved.customer,
          match_type: resolved.match_type,
          invoice_found: false,
          explanation: null,
          breakdown: null,
          previous_month: null,
          comparison: null,
        });
      }

      // Find the target month
      const targetRef = refMonth.slice(0, 7);
      const targetIdx = rows.findIndex((r) => {
        const rm = toIsoDate(r.reference_month)?.slice(0, 7) ?? "";
        return rm === targetRef;
      });

      if (targetIdx === -1) {
        // List available months for the user
        const availableMonths = [...new Set(rows.map((r) => toIsoDate(r.reference_month)?.slice(0, 7) ?? ""))];
        return sanitize({
          customer: resolved.customer,
          match_type: resolved.match_type,
          invoice_found: false,
          explanation: `No invoice found for ${targetRef}. Available months: ${availableMonths.join(", ")}`,
          breakdown: null,
          previous_month: null,
          comparison: null,
        });
      }

      const breakdown = buildBreakdown(rows[targetIdx]);

      // Find previous month
      let previousBreakdown: InvoiceBreakdown | null = null;
      let comparison: Comparison | null = null;

      if (targetIdx + 1 < rows.length) {
        previousBreakdown = buildBreakdown(rows[targetIdx + 1]);
        comparison = buildComparison(breakdown, previousBreakdown);
      }

      // Build explanation text
      const explanation = buildExplanation(
        resolved.customer.name,
        breakdown,
        previousBreakdown,
        comparison,
      );

      return sanitize({
        customer: resolved.customer,
        match_type: resolved.match_type,
        invoice_found: true,
        explanation,
        breakdown,
        previous_month: previousBreakdown ? {
          reference_month: previousBreakdown.reference_month,
          total: previousBreakdown.total,
          base_plan: previousBreakdown.base_plan,
          total_extras: previousBreakdown.extras.total_extras,
          usage: previousBreakdown.usage,
        } : null,
        comparison,
      });
    },
  });
