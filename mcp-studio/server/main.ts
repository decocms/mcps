/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import {
  ensureAssistantsTable,
  ensurePromptsTable,
} from "./db/schemas/agents.ts";
import { handleWorkflowEvents, WORKFLOW_EVENTS } from "./events/handler.ts";
import { createPrompts } from "./prompts.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      events: [...WORKFLOW_EVENTS] as string[],
      handler: async ({ events }, env) => {
        try {
          handleWorkflowEvents(events, env);
          return { success: true };
        } catch (error) {
          console.error(`[MAIN] Error handling events: ${error}`);
          return { success: false };
        }
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      await ensureIndexes(env);
      await ensureCollections(env);
      await ensureAssistantsTable(env);
      await ensurePromptsTable(env);
    },
    scopes: ["DATABASE::DATABASES_RUN_SQL", "EVENT_BUS::*", "*"],
    state: StateSchema,
  },
  tools,
  prompts: createPrompts,
});

serve(runtime.fetch);
