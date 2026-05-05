import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { listSurveys } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const surveySchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  responses_count: z.number().optional(),
  status: z.string().optional(),
});

const inputSchema = z.object({});

const outputSchema = z.object({
  surveys: z.array(surveySchema),
  total: z.number(),
});

export const listSurveysTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_list_surveys",
    description:
      "⚠️ Uses the undocumented legacy v2 API (may break without notice). List surveys on the account with response counts.",
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

      const surveys = await listSurveys({ apiKey, appKey });
      return { surveys, total: surveys.length };
    },
  });
