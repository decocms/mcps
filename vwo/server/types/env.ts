import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  accountId: z
    .string()
    .describe(
      "Default VWO Account/Workspace ID. Use 'current' for main workspace or an integer ID.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
