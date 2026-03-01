/**
 * Tool: AIRTABLE_SYNC (airtable_sync)
 *
 * Pulls records from an Airtable base and loads them into DuckDB, replacing
 * the local CSVs. Expects the same schema as the CSV files (same column
 * names). Requires AIRTABLE_CONFIG in the MCP state. Handles Airtable's
 * pagination automatically (100 records per page).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { saveCsv, reloadView } from "../db.ts";

// ---------------------------------------------------------------------------
// Airtable API
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

// Fetches all records from an Airtable table, handling pagination automatically.
// Airtable returns at most 100 records per request and includes an "offset" token
// when there are more pages. We keep looping until no offset is returned.
async function fetchAllRecords(
  apiKey: string,
  baseId: string,
  table: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
    );
    url.searchParams.set("pageSize", "100");
    // Pass the offset token from the previous response to get the next page.
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as AirtableResponse;
    // Each record has an internal Airtable ID (r.id = "recXXX") and the actual
    // field values (r.fields). We only keep r.fields — the internal ID is
    // meaningless to our data model and would pollute the CSV schema.
    results.push(...data.records.map((r) => r.fields));
    offset = data.offset;
  } while (offset);

  return results;
}

// ---------------------------------------------------------------------------
// CSV serialization
// ---------------------------------------------------------------------------

// Converts an array of Airtable field objects into a CSV string.
// Column headers are derived from the union of all keys across all records —
// this handles cases where some records are missing optional fields (they get
// an empty cell rather than causing an error or misaligned columns).
function recordsToCSV(records: Record<string, unknown>[]): string {
  if (records.length === 0) return "";

  // Collect unique column names in the order they first appear.
  // Using a Set preserves insertion order while deduplicating.
  const keysSet = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) keysSet.add(k);
  const keys = [...keysSet];

  // RFC 4180 CSV escaping: wrap values containing commas, double-quotes, or
  // newlines in double-quotes, and escape internal double-quotes by doubling them.
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    keys.map(escape).join(","),           // header row
    ...records.map((r) => keys.map((k) => escape(r[k])).join(",")),
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const createAirtableSyncTool = (env: Env) =>
  createPrivateTool({
    id: "airtable_sync",
    description:
      "Pulls data from Airtable and reloads the DuckDB views. " +
      "Requires AIRTABLE_CONFIG (api_key, base_id) in the MCP state. " +
      "Expects the Airtable tables to have the same column names as the CSV files. " +
      "Use 'tables' to sync only billing, only contacts, or both at once.",

    inputSchema: z.object({
      tables: z
        .enum(["all", "billing", "contacts"])
        .default("all")
        .describe(
          "Which tables to sync. 'all' syncs both billing and contacts.",
        ),
    }),

    outputSchema: z.object({
      success: z.boolean(),
      synced: z.array(
        z.object({
          table: z.string(),
          rows_loaded: z.number(),
        }),
      ),
      message: z.string(),
    }),

    execute: async ({ context }) => {
      const { tables } = context;

      const state =
        (env as any)?.MESH_REQUEST_CONTEXT?.state ?? (env as any)?.state;
      const config = state?.AIRTABLE_CONFIG;

      if (!config) {
        return {
          success: false,
          synced: [],
          message:
            "AIRTABLE_CONFIG not set. Add api_key, base_id, billing_table and contacts_table to the MCP state.",
        };
      }

      const { api_key, base_id, billing_table, contacts_table } = config;
      const synced: { table: string; rows_loaded: number }[] = [];

      try {
        if (tables === "all" || tables === "billing") {
          const records = await fetchAllRecords(api_key, base_id, billing_table);
          saveCsv("billing.csv", recordsToCSV(records));
          const rows = await reloadView("billing");
          synced.push({ table: "billing", rows_loaded: rows });
        }

        if (tables === "all" || tables === "contacts") {
          const records = await fetchAllRecords(
            api_key,
            base_id,
            contacts_table,
          );
          saveCsv("contacts.csv", recordsToCSV(records));
          const rows = await reloadView("contacts");
          synced.push({ table: "contacts", rows_loaded: rows });
        }

        const summary = synced
          .map((s) => `${s.table}: ${s.rows_loaded} rows`)
          .join(", ");

        return {
          success: true,
          synced,
          message: `Airtable sync complete. ${summary}.`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          synced,
          message: `Airtable sync failed: ${errorMsg}`,
        };
      }
    },
  });
