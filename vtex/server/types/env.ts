/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  accountName: z.string().describe("VTEX account name"),
  appKey: z
    .string()
    .optional()
    .describe(
      "VTEX App Key (required for private endpoints; not needed for public catalog searches)",
    ),
  appToken: z
    .string()
    .optional()
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
