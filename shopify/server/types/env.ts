/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
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
