/**
 * Airtable Sync (shared module)
 *
 * Core logic for pulling billing records from an Airtable view into DuckDB.
 * Used both at server startup (env vars) and on-demand (airtable_sync tool).
 *
 * Credential resolution priority:
 *   1. Explicit parameters passed by the caller (tool input)
 *   2. Environment variables: AIRTABLE_API_KEY, AIRTABLE_VIEW_URL
 *
 * Required token scopes: data.records:read only.
 * The Meta API (schema.bases:read) is not used — tableId is extracted
 * directly from the URL, which always contains app/tbl/viw segments.
 */

import { saveCsv, reloadView } from "./db.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

export type SyncResult = {
  rows: number;
  tableId: string;
  viewId: string;
};

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

/**
 * Resolves Airtable credentials from explicit parameters or env vars.
 * Returns null if either credential is missing from all sources.
 */
export function resolveAirtableCredentials(explicit?: {
  apiKey?: string;
  viewUrl?: string;
}): { apiKey: string; viewUrl: string } | null {
  const apiKey = explicit?.apiKey || process.env.AIRTABLE_API_KEY;
  const viewUrl = explicit?.viewUrl || process.env.AIRTABLE_VIEW_URL;
  if (!apiKey || !viewUrl) return null;
  return { apiKey, viewUrl };
}

// ---------------------------------------------------------------------------
// Airtable API helpers
// ---------------------------------------------------------------------------

/**
 * Parses an Airtable internal view URL into its three components.
 * Only the 3-segment format is supported — shared view URLs (shr) are not
 * supported by the Airtable REST API.
 *
 * Supported format:
 *   https://airtable.com/appXXX/tblXXX/viwXXX
 *   (copy from browser address bar while logged in to Airtable)
 */
function parseAirtableUrl(url: string): {
  baseId: string;
  tableId: string;
  viewId: string;
} {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts.length < 3) {
    throw new Error(
      `Invalid Airtable URL — expected 3 segments (app/tbl/viw). ` +
        `Got: ${url}. ` +
        `Open the base in your browser while logged in and copy the URL from the address bar.`,
    );
  }

  const [baseId, tableId, viewId] = parts;

  if (!baseId.startsWith("app")) {
    throw new Error(
      `Invalid base ID "${baseId}" — expected to start with "app".`,
    );
  }

  if (!tableId.startsWith("tbl")) {
    throw new Error(
      `Invalid table ID "${tableId}" — expected to start with "tbl".`,
    );
  }

  if (viewId.startsWith("shr")) {
    throw new Error(
      `Shared view URLs (shr...) are not supported by the Airtable REST API. ` +
        `Open the base in your browser while logged in, navigate to the view, ` +
        `and copy the URL from the address bar. It should look like: ` +
        `https://airtable.com/appXXX/tblXXX/viwXXX`,
    );
  }

  if (!viewId.startsWith("viw")) {
    throw new Error(
      `Invalid view ID "${viewId}" — expected to start with "viw".`,
    );
  }

  return { baseId, tableId, viewId };
}

/**
 * Fetches all records from an Airtable table/view, handling pagination automatically.
 * Each page returns up to 100 records; we loop until no offset is returned.
 * Requires only the data.records:read scope.
 */
async function fetchAllRecords(
  apiKey: string,
  baseId: string,
  tableId: string,
  viewId: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`,
    );
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("view", viewId);
    // cellFormat=string makes the API return all field values as human-readable
    // strings. Without this, linked record fields come back as arrays of record
    // IDs (e.g. ["recXXXX"]) instead of the display name (e.g. "Abracasa").
    url.searchParams.set("cellFormat", "string");
    // timeZone and userLocale are required when cellFormat=string is set —
    // Airtable uses them to format date/time fields as strings.
    url.searchParams.set("timeZone", "America/Sao_Paulo");
    url.searchParams.set("userLocale", "pt-BR");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as AirtableResponse;
    results.push(...data.records.map((r) => r.fields));
    offset = data.offset;
  } while (offset);

  return results;
}

// ---------------------------------------------------------------------------
// CSV serialization
// ---------------------------------------------------------------------------

/**
 * Converts Airtable field objects into an RFC 4180 CSV string.
 * Column headers come from the union of all keys across all records —
 * records missing optional fields get an empty cell rather than an error.
 */
function recordsToCSV(records: Record<string, unknown>[]): string {
  if (records.length === 0) return "";

  const keysSet = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) keysSet.add(k);
  const keys = [...keysSet];

  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  return [
    keys.map(escape).join(","),
    ...records.map((r) => keys.map((k) => escape(r[k])).join(",")),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public sync function
// ---------------------------------------------------------------------------

/**
 * Pulls all records from the Airtable view, serializes them to CSV,
 * persists the file to disk, and hot-reloads the DuckDB billing view.
 *
 * Throws if the view is empty (to avoid overwriting existing data with nothing).
 */
export async function syncFromAirtable(
  apiKey: string,
  viewUrl: string,
): Promise<SyncResult> {
  const { baseId, tableId, viewId } = parseAirtableUrl(viewUrl);
  const records = await fetchAllRecords(apiKey, baseId, tableId, viewId);

  if (records.length === 0) {
    throw new Error(
      `Airtable view "${viewId}" returned no records. Aborting to avoid overwriting existing data.`,
    );
  }

  saveCsv("billing.csv", recordsToCSV(records));
  const rows = await reloadView();

  console.log(
    `[Airtable] Synced ${tableId}/${viewId}: ${rows} rows loaded into DuckDB.`,
  );
  return { rows, tableId, viewId };
}
