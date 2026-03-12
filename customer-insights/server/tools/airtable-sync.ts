/**
 * Tool: AIRTABLE_SYNC (airtable_sync)
 *
 * On-demand trigger that pulls billing records from Airtable into DuckDB.
 * At server startup this happens automatically via env vars — this tool
 * exists for manual refreshes or to override credentials per-call.
 *
 * Credential resolution priority:
 *   1. Tool input params (api_key, view_url)
 *   2. Environment variables: AIRTABLE_API_KEY, AIRTABLE_VIEW_URL
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { resolveAirtableCredentials, syncFromAirtable } from "../airtable.ts";

export const createAirtableSyncTool = (_env: Env) =>
  createTool({
    id: "airtable_sync",
    description:
      "Pulls billing data from Airtable and reloads DuckDB. " +
      "Credentials are read from env vars (AIRTABLE_API_KEY, AIRTABLE_VIEW_URL) by default. " +
      "Pass api_key and/or view_url to override per-call.",

    inputSchema: z.object({
      api_key: z

        .string()

        .optional()

        .describe(
          "Airtable personal access token (pat...). Overrides AIRTABLE_API_KEY env var.",
        ),
      view_url: z

        .string()

        .optional()

        .describe(
          "Airtable view URL (https://airtable.com/appXXX/tblXXX/viwXXX). Overrides AIRTABLE_VIEW_URL env var.",
        ),
    }),

    outputSchema: z.object({
      success: z.boolean(),
      rows_loaded: z.number(),
      message: z.string(),
    }),

    execute: async ({ context }) => {
      const creds = resolveAirtableCredentials({
        apiKey: context.api_key,
        viewUrl: context.view_url,
      });

      if (!creds) {
        return {
          success: false,
          rows_loaded: 0,
          message:
            "Airtable credentials not found. Set AIRTABLE_API_KEY and AIRTABLE_VIEW_URL " +
            "environment variables, or pass api_key and view_url directly.",
        };
      }

      try {
        const { rows, tableId, viewId } = await syncFromAirtable(
          creds.apiKey,
          creds.viewUrl,
        );
        return {
          success: true,
          rows_loaded: rows,
          message: `Synced ${tableId}/${viewId}: ${rows} rows loaded into DuckDB.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          rows_loaded: 0,
          message: `Airtable sync failed: ${message}`,
        };
      }
    },
  });
