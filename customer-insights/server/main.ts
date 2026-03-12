/**
 * MCP Server Entry Point
 *
 * Initializes the DuckDB data layer, registers all MCP tools, and starts
 * the HTTP server. Gmail integration uses GOOGLE_CONFIG from state (no OAuth
 * flow required — token is configured manually in MCP Studio).
 * Tools: upload-csv, airtable-sync, billing, usage, timeline, emails,
 *        summary-generate, summary, invoice-explainer, health-list, risk-score.
 */

import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import { initDb, query } from "./db.ts";
import { resolveAirtableCredentials, syncFromAirtable } from "./airtable.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },

  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) {
  initDb()

    .then(async () => {
      // Auto-sync from Airtable if credentials are available via env vars.
      // This ensures DuckDB is always populated with fresh data on startup,
      // without any manual tool call required.
      const creds = resolveAirtableCredentials();
      if (creds) {
        console.log("[Airtable] Credentials found — syncing on startup...");
        try {
          const { rows, tableId, viewId } = await syncFromAirtable(
            creds.apiKey,
            creds.viewUrl,
          );
          console.log(
            `[Airtable] Startup sync complete: ${tableId}/${viewId} — ${rows} rows.`,
          );
        } catch (err) {
          // A sync failure must not prevent the server from starting.
          // If billing.csv exists on disk, DuckDB will still have data from the
          // previous run. Log the error and continue.
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Airtable] Startup sync failed: ${msg}`);
          console.warn(
            "[Airtable] Serving with existing on-disk data (if any).",
          );
        }
      } else {
        console.warn(
          "[Airtable] AIRTABLE_API_KEY or AIRTABLE_VIEW_URL not set. " +
            "Skipping startup sync — use the airtable_sync tool to load data manually.",
        );
      }

      const [row] = await query<{ total: number }>(
        "SELECT count(*) AS total FROM v_billing",
      );
      console.log(`[DB] DuckDB ready — v_billing has ${row.total} rows`);

      const [usageRow] = await query<{ total: number }>(
        "SELECT count(*) AS total FROM usage_stats",
      );
      console.log(`[DB] usage_stats has ${usageRow.total} rows`);

      serve(runtime.fetch!);
      console.log("MCP server is running.");
    })

    .catch((err) => {
      console.error("[DB] Failed to initialize DuckDB:", err);
      process.exit(1);
    });
}
