import { createHmac } from "node:crypto";

export type ParamValue = string | number | boolean | undefined;
export type ParamRecord = Record<string, ParamValue>;

function normalize(value: ParamValue): string | null {
  if (value === undefined) return null;
  return String(value);
}

/**
 * Build a signed query string for the legacy Crazy Egg v2 API.
 *
 * Algorithm (matches AMPERAGE Matomo widget):
 *   1. Drop entries with undefined values.
 *   2. Sort entries alphabetically by key.
 *   3. Concatenate `key + value` (no '=' between them) into a single string.
 *   4. signature = HMAC-SHA256(content, appKey).hex()
 *   5. Return `key=value&...&signed=<signature>`.
 */
export function buildSignedQueryString(
  params: ParamRecord,
  appKey: string,
): string {
  const entries: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(params)) {
    const value = normalize(raw);
    if (value !== null) entries.push([key, value]);
  }

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const content = entries.map(([k, v]) => `${k}${v}`).join("");
  const signature = createHmac("sha256", appKey).update(content).digest("hex");

  const queryParts = entries.map(([k, v]) => `${k}=${v}`);
  queryParts.push(`signed=${signature}`);
  return queryParts.join("&");
}

/**
 * Append a signed query string to a base URL.
 * Assumes the base URL has no existing query string.
 */
export function signUrl(
  baseUrl: string,
  params: ParamRecord,
  appKey: string,
): string {
  const query = buildSignedQueryString(params, appKey);
  return `${baseUrl}?${query}`;
}
