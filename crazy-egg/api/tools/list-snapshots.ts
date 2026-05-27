import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { listSnapshots } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const snapshotSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  source_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  heatmap_url: z.string().optional(),
  screenshot_url: z.string().optional(),
  total_visits: z.number().optional(),
  total_clicks: z.number().optional(),
  status: z.string().optional(),
});

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe("Maximum number of snapshots to return (default: all)."),
  status: z
    .string()
    .optional()
    .describe("Filter by snapshot status (e.g. 'active', 'paused')."),
});

const outputSchema = z.object({
  snapshots: z.array(snapshotSchema),
  total: z.number().describe("Total number of snapshots returned by the API."),
});

export const listSnapshotsTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_list_snapshots",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). List all heatmap snapshots on the account, with optional status filter and limit. Each snapshot includes thumbnail, heatmap, and screenshot URLs you can render in the UI.",
    inputSchema,
    outputSchema,

    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const apiKey = getApiKey(env);
      const appKey = getAppKey(env);

      const all = await listSnapshots({ apiKey, appKey });
      const total = all.length;

      let filtered = all;
      if (context.status) {
        filtered = filtered.filter((s) => s.status === context.status);
      }
      if (context.limit !== undefined) {
        filtered = filtered.slice(0, context.limit);
      }

      return {
        snapshots: filtered.map((s) => ({ ...s, id: String(s.id) })),
        total,
      };
    },
  });
