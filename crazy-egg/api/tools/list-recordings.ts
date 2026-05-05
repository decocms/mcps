import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { listRecordings } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const recordingSchema = z.looseObject({
  id: z.string(),
  duration: z.number().optional(),
  url: z.string().optional(),
  created_at: z.string().optional(),
});

const inputSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
});

const outputSchema = z.object({
  recordings: z.array(recordingSchema),
  total: z.number(),
});

export const listRecordingsTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_list_recordings",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). List session recordings on the account.",
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

      const all = await listRecordings({ apiKey, appKey });
      const total = all.length;
      const recordings =
        context.limit !== undefined ? all.slice(0, context.limit) : all;

      return { recordings, total };
    },
  });
