/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  baseUrl: z
    .string()
    .describe(
      "Magento store base URL, e.g. https://loja.granado.com.br (no trailing slash, no /rest)",
    ),
  apiToken: z
    .string()
    .describe(
      "Magento integration access token, sent as Authorization: Bearer",
    ),
  storeCode: z
    .string()
    .optional()
    .describe(
      'REST store code path segment, e.g. "granado" (default "all" — queries every store view)',
    ),
  currencyCode: z
    .string()
    .optional()
    .describe("Currency for money values, e.g. BRL or USD (default BRL)"),
  timezone: z
    .string()
    .optional()
    .describe(
      "Store timezone — IANA name like America/Sao_Paulo or ±HH:MM offset (default America/Sao_Paulo)",
    ),
  originHeader: z
    .string()
    .optional()
    .describe(
      "Secret value sent as the x-origin-header on every request (required by WAF-protected stores like Granado)",
    ),
  extraHeaders: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional headers sent on every Magento request"),
});

export type Env = DefaultEnv<typeof StateSchema>;

export interface MagentoCredentials {
  baseUrl: string;
  apiToken: string;
  storeCode?: string;
  currencyCode?: string;
  timezone?: string;
  originHeader?: string;
  extraHeaders?: Record<string, string>;
}
