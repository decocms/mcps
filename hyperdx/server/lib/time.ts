/**
 * Time-input resolver for HyperDX tool parameters.
 *
 * Accepts LLM-friendly expressions and resolves them to epoch milliseconds
 * so HyperDX tools don't force the LLM to compute `Date.now() ± offset` itself.
 */

import { z } from "zod";

export const TimeInputSchema = z.union([z.number(), z.string()]);
export type TimeInput = z.infer<typeof TimeInputSchema>;

const SIMPLE_DURATION_RE = /^(\d+)\s*(ms|s|m|h|d)$/i;
const NOW_EXPR_RE = /^now(?:\s*([+-])\s*([0-9smhd\s]+))?$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/;
// Heuristic: "looks like someone tried to write a duration"
const DURATION_LIKE_RE = /^[0-9smhd\s]+$/i;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const FORMS_LIST =
  "epoch ms (number); ISO 8601 with timezone " +
  "(e.g. '2026-04-24T14:00:00-03:00' or '...Z'); 'now', 'now-1h', 'now+15m'; " +
  "shorthand duration like '30m', '2h', '7d' (= N ago); date only YYYY-MM-DD " +
  "(treated as UTC midnight).";

const HELP_TEXT = `Accepted forms: ${FORMS_LIST}`;

function parseDurationMs(expr: string): number {
  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error(`Empty duration. ${HELP_TEXT}`);
  }
  const simple = SIMPLE_DURATION_RE.exec(trimmed);
  if (simple) {
    const [, n, unit] = simple;
    return Number(n) * UNIT_MS[unit.toLowerCase()];
  }
  // Compound like "2h30m" — every token must match contiguously and cover the
  // whole string. Local regex (not module-level) so there is no shared state.
  const compoundRe = /(\d+)\s*(ms|s|m|h|d)/gi;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = compoundRe.exec(trimmed)) !== null) {
    const [whole, n, unit] = match;
    if (match.index !== consumed) break;
    total += Number(n) * UNIT_MS[unit.toLowerCase()];
    consumed += whole.length;
  }
  if (consumed !== trimmed.length || total === 0) {
    throw new Error(
      `Could not parse duration '${expr}'. Use forms like '30m', '2h', '7d', '2h30m'. ${HELP_TEXT}`,
    );
  }
  return total;
}

/**
 * Resolve a user-supplied time value to epoch milliseconds.
 *
 * Throws if the string is unparseable — the error is surfaced back to the LLM
 * via MCP so it can self-correct (e.g. attach a missing timezone).
 */
export function resolveTime(input: TimeInput, opts?: { now?: number }): number {
  const now = opts?.now ?? Date.now();

  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`Invalid epoch ms: ${input}. ${HELP_TEXT}`);
    }
    return input;
  }

  const raw = input.trim();
  if (!raw) {
    throw new Error(`Empty time value. ${HELP_TEXT}`);
  }

  // Pure integer string → epoch ms
  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }

  // "now" or "now±<duration>"
  const nowMatch = NOW_EXPR_RE.exec(raw);
  if (nowMatch) {
    const [, sign, dur] = nowMatch;
    if (!sign) return now;
    const deltaMs = parseDurationMs(dur);
    return sign === "+" ? now + deltaMs : now - deltaMs;
  }

  // Bare duration like "1h", "30m", "2h30m" → N ago.
  // Strict path: composed only of digits, duration units, and whitespace.
  if (DURATION_LIKE_RE.test(raw)) {
    return now - parseDurationMs(raw);
  }

  // Plain date → UTC midnight.
  if (DATE_ONLY_RE.test(raw)) {
    const parsed = Date.parse(`${raw}T00:00:00Z`);
    if (Number.isFinite(parsed)) return parsed;
  }

  // Duration-shaped fallback: ends with a unit char and contains a digit, but
  // didn't pass the strict path (e.g. "1h-30m", "2h foo"). Surface a
  // duration-specific error rather than the generic "no timezone" one.
  if (/[smhd]$/i.test(raw) && /\d/.test(raw) && !raw.includes("T")) {
    throw new Error(
      `Could not parse '${raw}' as a duration. Use forms like '30m', '2h', '7d', '2h30m'. ${HELP_TEXT}`,
    );
  }

  // ISO 8601 — require explicit timezone so we don't silently guess.
  if (!HAS_TZ_RE.test(raw)) {
    throw new Error(
      `Timestamp '${raw}' has no timezone. Append 'Z' for UTC or an offset ` +
        `like '-03:00'. ${HELP_TEXT}`,
    );
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not parse time '${raw}'. ${HELP_TEXT}`);
  }
  return parsed;
}

/**
 * Convenience: resolve a start/end pair with a shared `now` anchor so
 * "now-1h"/"now" resolve against the same instant.
 */
export function resolveTimeRange(
  startTime: TimeInput,
  endTime: TimeInput,
  opts?: { now?: number },
): { startTime: number; endTime: number } {
  const now = opts?.now ?? Date.now();
  return {
    startTime: resolveTime(startTime, { now }),
    endTime: resolveTime(endTime, { now }),
  };
}

export const TIME_INPUT_DESCRIPTION = `Accepts: ${FORMS_LIST}`;
