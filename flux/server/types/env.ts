import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  BFL_API_KEY: z
    .string()
    .describe("Your Black Forest Labs API key from https://api.bfl.ai"),
});

export type Env = DefaultEnv<typeof StateSchema>;
