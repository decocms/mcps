/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import { ensurePromptsTable } from "./db/schemas/agents.ts";
import { handleWorkflowEvents, WORKFLOW_EVENTS } from "./events/handler.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      events: [...WORKFLOW_EVENTS] as string[],
      handler: async ({ events }, env) => {
        try {
          handleWorkflowEvents(events, env as unknown as Env);
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
      // Create tables first, then indexes
      await ensureCollections(env);
      await ensurePromptsTable(env);
      await ensureIndexes(env);
    },
    scopes: [
      "DATABASE::DATABASES_RUN_SQL",
      "EVENT_BUS::*",
      "CONNECTION::*",
      "*",
    ],
    state: StateSchema,
  },
  tools,
  prompts: [], // removed because this was making a call to the database for every request to the MCP server
});

serve(runtime.fetch);
