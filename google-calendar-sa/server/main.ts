import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "google-calendar/tools";
import { GOOGLE_SCOPES } from "google-calendar/constants";
import { type Env, StateSchema } from "../shared/deco.gen.ts";
import { getServiceAccountAccessToken } from "./lib/service-account.ts";

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
    },
  },
  // Always register tools — credentials are validated at execution time, not registration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: (env: Env) =>
    (tools as any[]).map((createTool: (env: any) => any) => {
      const tool = createTool(env);
      const originalExecute = tool.execute;

      return {
        ...tool,
        // deno-lint-ignore no-explicit-any
        execute: async (args: any) => {
          const state = env.MESH_REQUEST_CONTEXT?.state;
          const json = state?.SERVICE_ACCOUNT_JSON;
          const subject = state?.IMPERSONATE_EMAIL?.trim();

          if (!json || !subject) {
            throw new Error(
              "Service account not configured. Please fill in SERVICE_ACCOUNT_JSON and IMPERSONATE_EMAIL in the MCP settings.",
            );
          }

          const token = await getServiceAccountAccessToken(json, subject, [
            GOOGLE_SCOPES.CALENDAR,
            GOOGLE_SCOPES.CALENDAR_EVENTS,
          ]);
          (
            env.MESH_REQUEST_CONTEXT as unknown as Record<string, unknown>
          ).authorization = token;

          return originalExecute(args);
        },
      };
    }),
});

serve(runtime.fetch);
