/**
 * MCP Server Entry Point
 *
 * Initializes the DuckDB data layer, registers all MCP tools, sets up
 * Google OAuth for Gmail integration, and starts the HTTP server.
 * Tools: upload-csv, billing, usage, timeline, emails, summary.
 */

import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "./google-oauth.ts";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import { initDb, query } from "./db.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },

  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  }),
});

if (runtime.fetch) {
  initDb()
    .then(async () => {
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
