import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  region: z
    .enum(["us", "eu"])
    .default("us")
    .describe(
      "Dynamic Yield data center of the site. US uses dy-api.com, EU uses dy-api.eu.",
    ),
  profileAnywhereKey: z
    .string()
    .optional()
    .describe(
      "Optional Profile Anywhere API key (created in the Profile Anywhere app, not in Settings › API Keys). Required only by DY_USER_PROFILE.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
