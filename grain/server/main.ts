import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import type { Env } from "./types/env.ts";
import { StateSchema } from "./types/env.ts";

/**
 * Grain's public API, live, with the caller's own key: list, get, transcript,
 * summary. No index, no webhooks, no state. Searching what was said across
 * deco's calls, transcripts in a database and call events live in
 * decocms/grain-indexer.
 */
const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: { state: StateSchema },
  tools,
});

serve(runtime.fetch);
