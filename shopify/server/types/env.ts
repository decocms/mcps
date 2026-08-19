/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

// No connection config — auth is OAuth and the store comes from the token.
// The Admin API version is hardcoded (see DEFAULT_API_VERSION in constants.ts).
export const StateSchema = z.object({});

export type Env = DefaultEnv<typeof StateSchema>;

export interface ShopifyCredentials {
  storeDomain: string;
  accessToken: string;
}
