/**
 * Strapi CMS MCP Server
 *
 * This MCP provides tools for interacting with Strapi CMS API,
 * including content management, media, users, and roles.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
