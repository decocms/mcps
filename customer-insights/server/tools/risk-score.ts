/**
 * Tool: CUSTOMER_RISK_SCORE (customer_risk_score)
 *
 * Calculates a weighted churn risk score (0-10) for a specific customer.
 * Factors: payment delay average (weight 0.3), usage trend (0.2),
 * overdue frequency (0.2), overage percentage (0.15), tiering gap (0.15).
 * Returns the score, contributing factors, and recommended actions.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize } from "./sanitize.ts";

import { round2, num, clean } from "./utils.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type BillingRow = {
  amount: unknown;
  status: unknown;
  due_date: unknown;
  paid_date: unknown;
  reference_month: unknown;
  extra_pageviews_price: unknown;
  extra_req_price: unknown;
  extra_bw_price: unknown;
  pageviews: unknown;
  tier_40_cost: unknown;
  tier_50_cost: unknown;
  tier_80_cost: unknown;
};

type RiskFactor = {
  name: string;
  weight: number;
  raw_value: number;
  normalized: number; // 0-10
  weighted_contribution: number;
  description: string;
};

type RiskProfile = "stable" | "moderate" | "elevated" | "high" | "critical";

export const createRiskScoreTool = (_env: Env) =>
  createPrivateTool({
    id: "customer_risk_score",
    description:
      "Calculates a weighted churn risk score (0-10) for a customer based on payment delays, usage trends, overdue frequency, overage %, and tiering gap.",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("Numeric customer ID (recommended, unique). E.g.: 1108."),
      customer_name: z.string().optional()
        .describe("Customer name (exact or partial search). E.g.: Paula. Warning: names are not unique — prefer customer_id."),
    }),

    outputSchema: z.object({
      customer: z.any(),
      match_type: z.enum(["id", "exact", "partial"]),
      risk_score: z.number(),
      risk_profile: z.enum(["stable", "moderate", "elevated", "high", "critical"]),
      factors: z.array(z.any()),
      issues: z.array(z.string()),
      recommended_actions: z.array(z.string()),
    }),

    execute: async ({ context }) => {
      const resolved = await resolveCustomer({
        customer_id: clean(context.customer_id),
        customer_name: clean(context.customer_name),
      });

      const rows = await query<BillingRow>(
        `SELECT
          amount, status, due_date, paid_date, reference_month,
          COALESCE(extra_pageviews_price, 0) AS extra_pageviews_price,
          COALESCE(extra_req_price, 0) AS extra_req_price,
          COALESCE(extra_bw_price, 0) AS extra_bw_price,
          pageviews,
          tier_40_cost, tier_50_cost, tier_80_cost
        FROM v_billing
        WHERE id = ${resolved.customer.id}
        ORDER BY reference_month DESC`,
      );

      if (rows.length === 0) {
        return sanitize({
          customer: resolved.customer,
          match_type: resolved.match_type,
          risk_score: 0,
          risk_profile: "stable" as RiskProfile,
          factors: [],
          issues: ["No billing data available"],
          recommended_actions: ["Upload billing data to assess risk"],
        });
      }

      const issues: string[] = [];
      const actions: string[] = [];

      // ── FACTOR 1: Average payment delay (weight 0.3) ─────────────────────
      // Measures how many days on average the customer pays after the due date.
      // We only count paid invoices — overdue/pending ones have no paid_date yet.
      // A positive diffDays means the customer paid late; negative means early.
      const delays: number[] = [];
      for (const row of rows) {
        const status = String(row.status ?? "").toLowerCase();
        if (status === "paid" && row.due_date && row.paid_date) {
          const due = new Date(String(row.due_date));
          const paid = new Date(String(row.paid_date));
          if (!Number.isNaN(due.getTime()) && !Number.isNaN(paid.getTime())) {
            const diffDays = Math.round((paid.getTime() - due.getTime()) / 86_400_000);
            delays.push(diffDays);
          }
        }
      }
      const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
      // Normalize to 0-10: paying on time = 0, paying 30+ days late = 10.
      // Dividing by 3 means 30 days late maps exactly to a score of 10.
      const delayNorm = clamp(avgDelay / 3, 0, 10);
      if (avgDelay > 10) {
        issues.push(`Average payment delay: ${round2(avgDelay)} days`);
        actions.push("Review payment terms or offer payment plans");
      }

      // ── FACTOR 2: Usage trend (weight 0.2) ───────────────────────────────
      // Compares average pageviews in the last 3 months vs the 3 months before.
      // A significant drop in usage often precedes churn — the customer may have
      // migrated or reduced their footprint before cancelling the contract.
      const recentPV: number[] = [];
      const prevPV: number[] = [];
      for (let i = 0; i < Math.min(rows.length, 6); i++) {
        const pv = num(rows[i].pageviews);
        if (i < 3) recentPV.push(pv);  // rows are DESC, so index 0-2 = most recent
        else prevPV.push(pv);
      }
      const avgRecentPV = recentPV.length > 0 ? recentPV.reduce((a, b) => a + b, 0) / recentPV.length : 0;
      const avgPrevPV = prevPV.length > 0 ? prevPV.reduce((a, b) => a + b, 0) / prevPV.length : 0;
      let usageChangePct = 0;
      if (avgPrevPV > 0) {
        usageChangePct = ((avgRecentPV - avgPrevPV) / avgPrevPV) * 100;
      }
      // Negate the percentage: a decline of -50% becomes +10 risk.
      // Dividing by 5 means a -50% drop maps exactly to a score of 10.
      const usageNorm = clamp((-usageChangePct) / 5, 0, 10);
      if (usageChangePct < -25) {
        issues.push(`Usage declined ${round2(Math.abs(usageChangePct))}%`);
        actions.push("Proactive outreach to understand engagement drop");
      }

      // ── FACTOR 3: Overdue frequency (weight 0.2) ─────────────────────────
      // The ratio of unpaid invoices to total invoices. A high ratio suggests
      // either cash flow problems or dissatisfaction with the billing.
      const totalInvoices = rows.length;
      let overdueCount = 0;
      for (const row of rows) {
        const status = String(row.status ?? "").toLowerCase();
        if (status !== "paid") overdueCount++;
      }
      const overdueRate = totalInvoices > 0 ? overdueCount / totalInvoices : 0;
      // Multiplying by 20 means 50% overdue rate maps exactly to a score of 10.
      const overdueNorm = clamp(overdueRate * 20, 0, 10);
      if (overdueCount > 0) {
        issues.push(`${overdueCount}/${totalInvoices} invoices unpaid (${round2(overdueRate * 100)}%)`);
        actions.push(`Follow up on ${overdueCount} overdue invoice(s)`);
      }

      // ── FACTOR 4: Overage percentage (weight 0.15) ───────────────────────
      // Measures what fraction of the total bill comes from usage overages
      // (extra pageviews, requests, bandwidth). High overage means the customer
      // is consistently exceeding their plan limits — a plan upgrade candidate.
      let totalBilled = 0;
      let totalOverage = 0;
      for (const row of rows) {
        totalBilled += num(row.amount);
        totalOverage += num(row.extra_pageviews_price) + num(row.extra_req_price) + num(row.extra_bw_price);
      }
      const overagePct = totalBilled > 0 ? (totalOverage / totalBilled) * 100 : 0;
      // Dividing by 6 means 60% overage rate maps exactly to a score of 10.
      const overageNorm = clamp(overagePct / 6, 0, 10);
      if (overagePct > 40) {
        issues.push(`High overage: ${round2(overagePct)}% of total billing`);
      }

      // ── FACTOR 5: Tiering gap (weight 0.15) ──────────────────────────────
      // Compares what the customer actually paid vs what they would pay on the
      // cheapest available tier (tier_40, tier_50, tier_80 costs from the CSV).
      // A large gap means the customer is likely on a suboptimal plan and may
      // feel overcharged — increasing churn risk even if payments are on time.
      let tieringGapPct = 0;
      const recentRows = rows.slice(0, Math.min(6, rows.length));
      if (recentRows.length > 0) {
        let totalCurrent = 0;
        let totalBestAlt = 0;
        let hasTieringData = false;
        for (const row of recentRows) {
          const amount = num(row.amount);
          totalCurrent += amount;
          const tiers = [num(row.tier_40_cost), num(row.tier_50_cost), num(row.tier_80_cost)].filter((t) => t > 0);
          if (tiers.length > 0) {
            hasTieringData = true;
            // Pick the cheapest alternative tier for this billing period
            totalBestAlt += Math.min(...tiers);
          } else {
            // No tier data available: assume current plan is optimal
            totalBestAlt += amount;
          }
        }
        if (hasTieringData && totalBestAlt > 0 && totalCurrent > totalBestAlt) {
          tieringGapPct = ((totalCurrent - totalBestAlt) / totalCurrent) * 100;
        }
      }
      // Dividing by 3 means a 30% gap maps exactly to a score of 10.
      const tieringNorm = clamp(tieringGapPct / 3, 0, 10);
      if (tieringGapPct > 15) {
        issues.push(`Paying ${round2(tieringGapPct)}% more than the cheapest available tier`);
        actions.push("Present tiering optimization options to customer");
      }

      // Note: high overage doesn't automatically mean a tier change helps.
      // Only recommend an upgrade if the tiering analysis confirms a cheaper option exists.
      if (overagePct > 40) {
        if (tieringGapPct > 15) {
          actions.push("Suggest plan upgrade to reduce overage costs");
        } else {
          actions.push("Review billing structure and usage optimization; no cheaper tier identified");
        }
      }

      // ── WEIGHTED SCORE ────────────────────────────────────────────────────
      // Each factor contributes its normalized score (0-10) multiplied by its
      // weight. Weights sum to 1.0 so the final score stays in the 0-10 range.
      const factors: RiskFactor[] = [
        {
          name: "payment_delay",
          weight: 0.3,
          raw_value: round2(avgDelay),
          normalized: round2(delayNorm),
          weighted_contribution: round2(delayNorm * 0.3),
          description: `Average ${round2(avgDelay)} days between due date and payment`,
        },
        {
          name: "usage_trend",
          weight: 0.2,
          raw_value: round2(usageChangePct),
          normalized: round2(usageNorm),
          weighted_contribution: round2(usageNorm * 0.2),
          description: `Pageviews ${usageChangePct >= 0 ? "+" : ""}${round2(usageChangePct)}% (recent 3m vs previous 3m)`,
        },
        {
          name: "overdue_frequency",
          weight: 0.2,
          raw_value: round2(overdueRate * 100),
          normalized: round2(overdueNorm),
          weighted_contribution: round2(overdueNorm * 0.2),
          description: `${overdueCount}/${totalInvoices} invoices unpaid (${round2(overdueRate * 100)}%)`,
        },
        {
          name: "overage_percentage",
          weight: 0.15,
          raw_value: round2(overagePct),
          normalized: round2(overageNorm),
          weighted_contribution: round2(overageNorm * 0.15),
          description: `Overage is ${round2(overagePct)}% of total billing`,
        },
        {
          name: "tiering_gap",
          weight: 0.15,
          raw_value: round2(tieringGapPct),
          normalized: round2(tieringNorm),
          weighted_contribution: round2(tieringNorm * 0.15),
          description: tieringGapPct > 0
            ? `Paying ${round2(tieringGapPct)}% above cheapest tier`
            : "Already on optimal or near-optimal tier",
        },
      ];

      const riskScore = round2(
        factors.reduce((sum, f) => sum + f.weighted_contribution, 0),
      );

      // Map the numeric score to a human-readable risk profile label.
      // Thresholds: 0-1 stable, 1-3 moderate, 3-5 elevated, 5-7 high, 7-10 critical.
      let riskProfile: RiskProfile;
      if (riskScore <= 1) riskProfile = "stable";
      else if (riskScore <= 3) riskProfile = "moderate";
      else if (riskScore <= 5) riskProfile = "elevated";
      else if (riskScore <= 7) riskProfile = "high";
      else riskProfile = "critical";

      if (issues.length === 0) {
        issues.push("No significant risk factors detected");
      }
      if (actions.length === 0) {
        actions.push("Continue monitoring — no immediate action required");
      }

      const uniqueActions = Array.from(new Set(actions));

      return sanitize({
        customer: resolved.customer,
        match_type: resolved.match_type,
        risk_score: riskScore,
        risk_profile: riskProfile,
        factors,
        issues,
        recommended_actions: uniqueActions,
      });
    },
  });
