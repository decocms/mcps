/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  accountName: z
    .string()
    .default(process.env.VTEX_ACCOUNT_NAME ?? "")
    .describe("VTEX account name"),
  appKey: z
    .string()
    .optional()
    .default(process.env.VTEX_APP_KEY ?? "")
    .describe(
      "VTEX App Key (required for private endpoints; not needed for public catalog searches)",
    ),
  appToken: z
    .string()
    .optional()
    .default(process.env.VTEX_APP_TOKEN ?? "")
    .describe(
      "VTEX App Token (required for private endpoints; not needed for public catalog searches)",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;

export interface VTEXCredentials {
  accountName: string;
  appKey?: string;
  appToken?: string;
}
