import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  ORGANIZATION_NAME: z
    .string()
    .optional()
    .describe(
      "Nome da organização (ex: minha-empresa). Usado para identificar a chave no OpenRouter como 'decocms-mesh-org-{nome}-{id}'.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
