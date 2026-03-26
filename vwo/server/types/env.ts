import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  apiToken: z
    .string()
    .describe("VWO API Token from https://app.vwo.com/#/developers/tokens"),
  accountId: z
    .string()
    .min(1)
    .describe(
      "Default VWO Account/Workspace ID. Use 'current' for main workspace or an integer ID.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
