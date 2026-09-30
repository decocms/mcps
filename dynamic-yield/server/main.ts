import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: { state: StateSchema },
  tools,
});

/** Served without `withAuth`: the Authorization header carries the user's DY API key. Tracked in `auth-exemptions.json`. */
if (runtime.fetch) {
  serve(runtime.fetch);
}
