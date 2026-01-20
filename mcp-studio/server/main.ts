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
import { generateResponseForEvent, ThreadMessage } from "./llm.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      SELF: {
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
      EVENT_BUS: {
        handler: async ({ events }, env) => {
          try {
            for (const event of events) {
              if (event.type === "public:operator.generate") {
                const { messages } = event.data as {
                  messages: ThreadMessage[];
                };
                if (!messages) {
                  console.error("[Mesh Operator] No messages found in event");
                  continue;
                }
                const subject = event.subject ?? crypto.randomUUID();
                generateResponseForEvent(env, messages, subject);
              }
            }
          } catch (error) {
            console.error("[WhatsApp] Error handling events:", error);
            return { success: false };
          }
          return { success: true };
        },
        events: ["public:operator.generate"],
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      // Create tables first, then indexes
      try {
        await ensureCollections(env);
        await ensurePromptsTable(env);
        await ensureIndexes(env);
      } catch (error) {
        console.error("Error ensuring tables and indexes:", error);
      }
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
