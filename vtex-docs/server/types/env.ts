/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({});

type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_CHAT_REQUEST_CONTEXT: {
    state: State;
  };
};
