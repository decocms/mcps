/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */

import { serve } from "@decocms/mcps-shared/serve";
import {
  type BindingRegistry,
  type DefaultEnv,
  withRuntime,
} from "@decocms/runtime";
import type { z } from "zod";
import { ensurePromptsTable } from "./db/schemas/agents.ts";
import { createPrompts } from "./prompts.ts";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import { StateSchema } from "./types/env.ts";
import { WORKFLOW_EVENTS, handleWorkflowEvents } from "./events/handler.ts";
import { ensureAssistantsTable } from "./db/schemas/agents.ts";
import type { Env as DecoEnv } from "./types/env.ts";

export { StateSchema };

interface Registry extends BindingRegistry {
  "@deco/postgres": [
    {
      name: "DATABASES_RUN_SQL";
      description: "Run a SQL query against the database";
      inputSchema: z.ZodType<
        Parameters<Env["DATABASE"]["DATABASES_RUN_SQL"]>[0]
      >;
      outputSchema: z.ZodType<
        Awaited<ReturnType<Env["DATABASE"]["DATABASES_RUN_SQL"]>>
      >;
    },
  ];
}
/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry> & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    events: {
      handlers: {
        events: [...WORKFLOW_EVENTS] as string[],
        handler: async ({ events }, env) => {
          try {
            handleWorkflowEvents(events, mergeEnvWithState(env));
            return { success: true };
          } catch (error) {
            console.error(`[MAIN] Error handling events: ${error}`);
            return { success: false };
          }
        },
      },
    },
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
