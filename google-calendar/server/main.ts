import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { GOOGLE_SCOPES } from "./constants.ts";
import { type Env, StateSchema } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["EVENT_BUS::*"],
    state: StateSchema,
  },
  events: {
    handlers: {
      SELF: {
        events: ["google-calendar.*"],
        handler: async ({ events }) => {
          for (const event of events) {
            console.log(`[SELF] Event: ${event.type}`);
          }
          return { success: true };
        },
      },
      EVENT_BUS: {
        events: ["google-calendar.*"],
        handler: async ({ events }) => {
          for (const event of events) {
            console.log(`[EVENT_BUS] Event: ${event.type}`);
          }
          return { success: true };
        },
      },
    },
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [GOOGLE_SCOPES.CALENDAR, GOOGLE_SCOPES.CALENDAR_EVENTS],
  }),
});

serve(runtime.fetch);
