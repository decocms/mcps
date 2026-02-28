import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  MCP_ACCESS_TOKEN: z
    .string()
    .min(1)
    .describe(
      "Private token configured in this MCP connection. Must match server secret MCP_ACCESS_TOKEN.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
