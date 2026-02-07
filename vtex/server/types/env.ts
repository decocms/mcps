/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  accountName: z.string().describe("VTEX account name"),
  appKey: z.string().describe("VTEX App Key"),
  appToken: z.string().describe("VTEX App Token"),
});

type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_CHAT_REQUEST_CONTEXT: {
    state: State;
  };
};

export interface VTEXCredentials {
  accountName: string;
  appKey: string;
  appToken: string;
}
