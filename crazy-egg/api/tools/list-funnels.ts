import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { listFunnels } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const funnelSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  stages: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        visitors: z.number().optional(),
      }),
    )
    .optional(),
});

const inputSchema = z.object({});

const outputSchema = z.object({
  funnels: z.array(funnelSchema),
  total: z.number(),
});

export const listFunnelsTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_list_funnels",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). List conversion funnels on the account, including per-stage visitor counts when available.",
    inputSchema,
    outputSchema,
    _meta: { ui: { resourceUri: CRAZY_EGG_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const apiKey = getApiKey(env);
      const appKey = getAppKey(env);

      const funnels = await listFunnels({ apiKey, appKey });
      return { funnels, total: funnels.length };
    },
  });
