import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");

import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

void requireEnv("INTERNAL_DATABASE_URL");

if (runtime.fetch) {
  serve(runtime.fetch);
}
