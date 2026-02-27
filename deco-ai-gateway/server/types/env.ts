import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  ORGANIZATION_NAME: z
    .string()
    .optional()
    .describe(
      "Organization name (e.g. my-company). Used to identify the key in OpenRouter as 'decocms-mesh-org-{name}-{id}'.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
