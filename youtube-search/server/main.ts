/**
 * YouTube Search MCP — public YouTube access with zero configuration.
 *
 * Keyless (Innertube via youtubei.js): search, full video details,
 * transcripts (including auto-generated captions) and video/audio
 * downloads delivered through the org's object storage.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export { StateSchema };
export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    scopes: [
      "OBJECT_STORAGE::GET_PRESIGNED_URL",
      "OBJECT_STORAGE::PUT_PRESIGNED_URL",
    ],
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

serve(runtime.fetch);
