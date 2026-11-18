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
  currency: z
    .string()
    .optional()
    .describe(
      "Store currency for analytics endpoints, e.g. BRL or USD (default BRL)",
    ),
  writeMode: z
    .boolean()
    .optional()
    .describe(
      "Opt-in to write operations. When false or omitted (default), the MCP is read-only: only read tools (GET/LIST/SEARCH) run and any create/update/delete tool is refused. Set to true to allow writes.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;

export interface VTEXCredentials {
  accountName: string;
  appKey?: string;
  appToken?: string;
}
