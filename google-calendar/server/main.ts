import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { createGetAppsScriptConfigTool } from "./tools/apps-script.ts";
import { triggers } from "./lib/trigger-store.ts";
import {
  isSupabaseConfigured,
  loadAllTriggerCredentials,
} from "./lib/supabase-client.ts";
import { app as webhookRouter } from "./router.ts";
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
  tools: (env: Env) => [
    ...tools.map((createTool) => createTool(env)),
    // Trigger config tools (TRIGGER_CONFIGURE / TRIGGER_UNCONFIGURE) and the
    // Apps Script setup helper — only on the OAuth app, not the shared index.
    ...triggers.tools(),
    createGetAppsScriptConfigTool(env),
  ],
  oauth: createGoogleOAuth({
    scopes: [GOOGLE_SCOPES.CALENDAR, GOOGLE_SCOPES.CALENDAR_EVENTS],
  }),
});

// Bootstrap: warm trigger credentials from Supabase so they survive restarts.
// The runtime never replays TRIGGER_CONFIGURE, so this store is the source of
// truth for where to forward inbound Apps Script events.
if (isSupabaseConfigured()) {
  try {
    const allCreds = await loadAllTriggerCredentials();
    console.log(
      `[BOOTSTRAP] Loaded trigger credentials for ${allCreds.length} connection(s)`,
    );
  } catch (error) {
    console.error("[BOOTSTRAP] Failed to load trigger credentials:", error);
  }
} else {
  console.warn(
    "[BOOTSTRAP] Supabase not configured — calendar triggers will not persist. " +
      "Set SUPABASE_URL / SUPABASE_ANON_KEY.",
  );
}

// Webhook routes (/health, /calendar/events/:connectionId) are handled by the
// Hono router. A 404 means "not a webhook route" — fall through to /mcp.
serve(async (req, env, ctx) => {
  const webhookResponse = await webhookRouter.fetch(req, env, ctx);
  if (webhookResponse.status !== 404) {
    return webhookResponse;
  }
  return runtime.fetch(req, env, ctx);
});
