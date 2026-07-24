/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  storeDomain: z
    .string()
    .describe(
      "Shopify store domain, e.g. my-store.myshopify.com (the Admin API access token goes in the connection's Authorization field)",
    ),
  apiVersion: z
    .string()
    .optional()
    .describe("Admin GraphQL API version (default 2026-07)"),
});

export type Env = DefaultEnv<typeof StateSchema>;

export interface ShopifyCredentials {
  storeDomain: string;
  accessToken: string;
  apiVersion?: string;
}
