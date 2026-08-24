/**
 * Environment Type Definitions
 *
 * StateSchema is the configuration form shown when installing the Wake MCP.
 * V1 talks only to the Wake Storefront GraphQL API, which authenticates with a
 * single Storefront token sent as the `TCS-Access-Token` header.
 */
import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  storefrontToken: z
    .string()
    .describe(
      "Wake Storefront API token, sent as the TCS-Access-Token header. Create one at https://wakecommerce.readme.io/docs/storefront-api-criacao-e-autenticacao-do-token",
    ),
  account: z
    .string()
    .optional()
    .describe(
      'Wake account name (e.g. "erploja2"). Optional; used only for reference and links.',
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
