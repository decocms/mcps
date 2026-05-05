import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { listAbTests } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const abTestSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  variations: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        visitors: z.number().optional(),
        conversions: z.number().optional(),
      }),
    )
    .optional(),
});

const inputSchema = z.object({});

const outputSchema = z.object({
  abTests: z.array(abTestSchema),
  total: z.number(),
});

export const listAbTestsTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_list_ab_tests",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). List A/B tests (CTAs and variations) on the account, including per-variation visitor and conversion counts when available.",
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

      const abTests = await listAbTests({ apiKey, appKey });
      return { abTests, total: abTests.length };
    },
  });
