import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getApiKey } from "../lib/env.ts";

const SYNC_URL =
  "https://admin.deco.cx/live/invoke/deco-sites/admin/actions/airtable/sync.ts";

export const createSyncAirtableTable = (_env: Env) =>
  createPrivateTool({
    id: "syncAirtableTable",
    description:
      "Triggers the deco.cx admin Airtable sync action for a given table. " +
      "Use mode 'dry-run' to preview changes without applying them.",
    inputSchema: z.object({
      table: z
        .string()
        .describe('Name of the Airtable table to sync, e.g. "invoices"'),
      shouldStartWorkflow: z
        .boolean()
        .default(false)
        .describe("Whether to start a workflow after the sync completes"),
      mode: z
        .enum(["apply", "dry-run"])
        .default("apply")
        .describe(
          '"apply" executes the sync for real; "dry-run" simulates without making changes',
        ),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      status: z.number(),
      body: z.unknown(),
    }),
    execute: async ({ context, runtimeContext }) => {
      const apiKey = getApiKey(runtimeContext.env as Env);
      const { table, shouldStartWorkflow, mode } = context;

      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ table, shouldStartWorkflow, mode }),
      });

      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // keep as plain text
      }

      if (!res.ok) {
        throw new Error(`Sync failed (${res.status}): ${text}`);
      }

      return { ok: true, status: res.status, body };
    },
  });
