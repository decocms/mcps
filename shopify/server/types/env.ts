/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

// No connection config — auth is OAuth and the store comes from the token.
// The Admin API version defaults to DEFAULT_API_VERSION; override per deploy
// with the SHOPIFY_API_VERSION env var (see resolveCredentials).
export const StateSchema = z.object({});

export type Env = DefaultEnv<typeof StateSchema>;

export interface ShopifyCredentials {
  storeDomain: string;
  accessToken: string;
  apiVersion?: string;
}
