/**
 * BigInt Sanitizer
 *
 * Converts BigInt values to Number for JSON serialization compatibility.
 * DuckDB returns BigInt for integer columns, which JSON.stringify cannot handle.
 */

export function sanitize<T>(value: T): T {
  if (typeof value === "bigint") return Number(value) as T;
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return (Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)) as T;
  }
  if (Array.isArray(value)) return value.map(sanitize) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map(sanitize);
}
