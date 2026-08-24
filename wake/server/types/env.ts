/**
 * Environment Type Definitions
 *
 * StateSchema is the configuration form shown when installing the Wake MCP.
 *
 * The MCP talks to two Wake APIs:
 * - Storefront GraphQL (public catalog), authenticated with `storefrontToken`
 *   sent as the `TCS-Access-Token` header.
 * - Admin REST (api.fbits.net, orders/analytics), authenticated with `apiToken`
 *   sent as the `Authorization: Basic <token>` header.
 */
import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  storefrontToken: z
    .string()
    .describe(
      "Wake Storefront API token, sent as the TCS-Access-Token header. Required for catalog/product tools. Create one at https://wakecommerce.readme.io/docs/storefront-api-criacao-e-autenticacao-do-token",
    ),
  apiToken: z
    .string()
    .optional()
    .describe(
      "Wake Admin API token, sent as the `Authorization: Basic <token>` header for api.fbits.net. Required only for admin tools (orders/analytics). See https://wakecommerce.readme.io/docs/introducao-a-api",
    ),
  account: z
    .string()
    .optional()
    .describe(
      'Wake account name (e.g. "erploja2"). Optional; used only for reference and links.',
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
