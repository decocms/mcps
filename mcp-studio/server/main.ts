/**
 * MCP Studio Server Main Entry
 *
 * Runtime configuration and wiring.
 */

import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./collections/index.ts";
import { ensureAgentsTable } from "./lib/postgres.ts";
import { handleWorkflowEvents, workflowEventTypes } from "./events/handler.ts";
import { StateSchema, type Env } from "./types/env.ts";

export type { Env };
export { StateSchema };

function mergeEnvWithState(env: unknown): Env {
  if (!(env instanceof Object) || !("MESH_REQUEST_CONTEXT" in env)) {
    console.error("Invalid environment", env);
    throw new Error("Invalid environment");
  }
  return { ...env, ...(env as any).MESH_REQUEST_CONTEXT?.state } as Env;
}

const runtime = withRuntime<Env, typeof StateSchema>({
  events: {
    handlers: {
      events: workflowEventTypes,
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
  configuration: {
    onChange: async (env) => {
      const mergedEnv = mergeEnvWithState(env);
      try {
        await ensureAgentsTable(mergedEnv);
        await ensureCollections(mergedEnv);
        await ensureIndexes(mergedEnv);
      } catch (error) {
        console.error("error changing configuration", error);
      }
    },
    scopes: ["DATABASE::DATABASES_RUN_SQL", "EVENT_BUS::*", "CONNECTION::*"],
    state: StateSchema,
  },
  tools: (env) => tools.map((tool) => tool(mergeEnvWithState(env))),
});

export default runtime;
