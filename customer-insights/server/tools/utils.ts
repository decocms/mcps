/**
 * Shared utility functions used across multiple tools.
 *
 * Centralizes common helpers to avoid duplication: type coercion,
 * date formatting, SQL escaping, math rounding, and date arithmetic.
 */

/** Returns trimmed string or undefined for null/empty values. */
export function clean(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return String(v);
}

/** Rounds a number to 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coerces unknown DB value (number | bigint | other) to a finite number. Returns 0 for non-numeric. */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "bigint") return Number(v);
  return 0;
}

/** Converts a DuckDB value (Date | string | null) to "YYYY-MM-DD" or null. */
export function toDateOnly(value?: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Escapes single quotes for safe SQL string interpolation. */
export function escapeSqlLiteral(input: string): string {
  return input.replace(/'/g, "''");
}

/** Returns the number of whole days between two Date objects. */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / msPerDay);
}
