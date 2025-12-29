import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import { WORKFLOW_EVENTS, handleWorkflowEvents } from "./events/handler.ts";
import { ensureAssistantsTable } from "./db/schemas/agents.ts";

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
  configuration: {
    onChange: async (env) => {
      const mergedEnv = mergeEnvWithState(env);
      try {
        await ensureCollections(mergedEnv);
        await ensureIndexes(mergedEnv);
        await ensureAssistantsTable(mergedEnv);
      } catch (error) {
        console.error("error changing configuration", error);
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
  tools: (env) => tools.map((tool) => tool(mergeEnvWithState(env))),
});

export default runtime;
