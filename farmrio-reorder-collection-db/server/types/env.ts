import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  MCP_ACCESS_TOKEN: z
    .string()
    .min(1)
    .describe(
      "Token de acesso configurado na conexão. As tools só ficam disponíveis quando este campo estiver preenchido.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
