import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { getSnapshot } from "../lib/client.ts";
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
  snapshotId: z
    .string()
    .min(1)
    .describe("Snapshot ID returned by crazy_egg_list_snapshots."),
});

const outputSchema = z.object({
  snapshot: snapshotSchema,
});

export const getSnapshotTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_get_snapshot",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). Fetch detailed metadata for a single heatmap snapshot, including the heatmap_url and screenshot_url you can render in the UI.",
    inputSchema,
    outputSchema,
    _meta: { ui: { resourceUri: CRAZY_EGG_RESOURCE_URI } },
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

      const snapshot = await getSnapshot({
        apiKey,
        appKey,
        snapshotId: context.snapshotId,
      });

      return { snapshot };
    },
  });
