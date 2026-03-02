/**
 * Estimates how long remaining credit will last based on historical usage.
 *
 * Strategy:
 *  1. Prefer monthly usage (most samples → smoothest signal)
 *  2. Fall back to weekly, then daily
 *  3. Weight by actual elapsed days in the period (handles new keys)
 *  4. Account for limit_reset — if limit resets before depletion the user is safe
 */

export interface CreditEstimation {
  /** Avg raw $/day based on the best available window. */
  avgDailySpend: number;
  /** Estimated calendar days until credit hits 0 (null = unlimited or no usage). */
  estimatedDaysRemaining: number | null;
  /** ISO date (YYYY-MM-DD) when credit is projected to run out. */
  estimatedDepletionDate: string | null;
  /** true when the limit resets (monthly/weekly/daily) before the projected depletion. */
  resetsBeforeDepletion: boolean;
  /** How much data backs the estimate. */
  confidence: "low" | "medium" | "high";
  /** Which usage window was selected. */
  basedOn: "monthly" | "weekly" | "daily";
}

export interface EstimationInput {
  limitRemaining: number | null;
  limitReset: string | null;
  usageMonthly: number;
  usageWeekly: number;
  usageDaily: number;
  keyCreatedAt: string;
}

function daysElapsed(from: Date, to: Date): number {
  return Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Returns null when an estimate is impossible (unlimited credit or zero usage).
 */
export function estimateCreditDuration(
  input: EstimationInput,
): CreditEstimation | null {
  const {
    limitRemaining,
    limitReset,
    usageMonthly,
    usageWeekly,
    usageDaily,
    keyCreatedAt,
  } = input;

  if (limitRemaining == null || limitRemaining <= 0) return null;

  const now = new Date();
  const keyCreated = new Date(keyCreatedAt);
  if (Number.isNaN(keyCreated.getTime())) return null;

  // --- monthly window ---
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const effectiveMonthStart = keyCreated > monthStart ? keyCreated : monthStart;
  const daysInMonth = daysElapsed(effectiveMonthStart, now);

  // --- weekly window (ISO week: Mon → Sun) ---
  const dow = now.getDay(); // 0=Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  const effectiveWeekStart = keyCreated > weekStart ? keyCreated : weekStart;
  const daysInWeek = daysElapsed(effectiveWeekStart, now);

  let avgDailySpend: number;
  let confidence: CreditEstimation["confidence"];
  let basedOn: CreditEstimation["basedOn"];

  if (usageMonthly > 0 && daysInMonth >= 3) {
    avgDailySpend = usageMonthly / daysInMonth;
    confidence = daysInMonth >= 7 ? "high" : "medium";
    basedOn = "monthly";
  } else if (usageWeekly > 0 && daysInWeek >= 2) {
    avgDailySpend = usageWeekly / daysInWeek;
    confidence = "medium";
    basedOn = "weekly";
  } else if (usageDaily > 0) {
    avgDailySpend = usageDaily;
    confidence = "low";
    basedOn = "daily";
  } else {
    return null;
  }

  const daysRemaining = limitRemaining / avgDailySpend;
  const depletionDate = new Date(now.getTime() + daysRemaining * 86_400_000);

  let resetsBeforeDepletion = false;
  if (limitReset === "monthly") {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    resetsBeforeDepletion = depletionDate > nextMonth;
  } else if (limitReset === "weekly") {
    const daysUntilMonday = (8 - (dow || 7)) % 7 || 7;
    const nextReset = new Date(now);
    nextReset.setDate(nextReset.getDate() + daysUntilMonday);
    nextReset.setHours(0, 0, 0, 0);
    resetsBeforeDepletion = depletionDate > nextReset;
  } else if (limitReset === "daily") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    resetsBeforeDepletion = depletionDate > tomorrow;
  }

  return {
    avgDailySpend: Math.round(avgDailySpend * 1_000_000) / 1_000_000,
    estimatedDaysRemaining: Math.round(daysRemaining * 10) / 10,
    estimatedDepletionDate: depletionDate.toISOString().split("T")[0]!,
    resetsBeforeDepletion,
    confidence,
    basedOn,
  };
}

/** One-line human-readable summary of the estimation. */
export function estimationSummary(est: CreditEstimation | null): string {
  if (!est) return "No usage yet — estimation not available.";

  const rate = `$${est.avgDailySpend.toFixed(4)}/day`;

  if (est.resetsBeforeDepletion) {
    return (
      `At ~${rate} (${est.basedOn} avg, ${est.confidence} confidence), ` +
      `credit will reset before running out.`
    );
  }

  if (est.estimatedDaysRemaining == null) return "Estimation incomplete.";
  const days = est.estimatedDaysRemaining;
  const label =
    days < 1
      ? "less than a day"
      : days < 2
        ? "~1 day"
        : `~${Math.round(days)} days`;

  return (
    `At ~${rate} (${est.basedOn} avg, ${est.confidence} confidence), ` +
    `credit will last ${label} (until ${est.estimatedDepletionDate}).`
  );
}
