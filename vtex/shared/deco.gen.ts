/**
 * Auto-generated file. Do not edit manually.
 * Run `deco gen` to regenerate.
 */

import { z } from "zod";

export const StateSchema = z.object({
  /**
   * @description VTEX Account Name (e.g., "mystore")
   */
  account: z.string().describe("VTEX Account Name"),
  
  /**
   * @description VTEX Environment (e.g., "vtexcommercestable")
   */
  environment: z.string().default("vtexcommercestable").describe("VTEX Environment"),
  
  /**
   * @description Sales Channel ID
   */
  salesChannel: z.string().default("1").describe("Sales Channel ID"),
  
  /**
   * @description Default locale (e.g., "pt-BR")
   */
  locale: z.string().default("pt-BR").describe("Default Locale"),
  
  /**
   * @description Default currency code (e.g., "BRL")
   */
  currency: z.string().default("BRL").describe("Currency Code"),
});

export type State = z.infer<typeof StateSchema>;

export interface Env {
  SELF: unknown;
  DECO_REQUEST_CONTEXT?: {
    state?: State;
  };
}

