import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./collections/index.ts";
import { insertDefaultWorkflowIfNotExists } from "./tools/workflow/workflow.ts";
import { ensureAgentsTable } from "./lib/postgres.ts";

export type Env = DefaultEnv<typeof StateSchema> &
  DecoEnv & {
    DATABASE: {
      DATABASES_RUN_SQL: (params: {
        sql: string;
        params: unknown[];
      }) => Promise<{ result: { results: unknown[] }[] }>;
    };
    EVENT_BUS: {
      EVENT_PUBLISH: (params: {
        type: string;
        subject: string;
        data: unknown;
      }) => Promise<unknown>;
      EVENT_SUBSCRIBE: (params: { eventType: string }) => Promise<unknown>;
    };
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    onChange: async (env) => {
      try {
        await env.EVENT_BUS.EVENT_SUBSCRIBE({
          eventType: "workflow.execution.created",
        });
        await ensureAgentsTable(env);
        await ensureCollections(env);
        await ensureIndexes(env);
        await insertDefaultWorkflowIfNotExists(env);
      } catch (error) {
        console.error("error changing configuration", error);
      }
    },
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: [
      Scopes.DATABASE.DATABASES_RUN_SQL,
      Scopes.EVENT_BUS.EVENT_PUBLISH,
      Scopes.EVENT_BUS.EVENT_SUBSCRIBE,
    ],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like. When a user
     * is installing your App, they will have to fill in
     * a form with the fields defined in the state schema.
     *
     * This is powerful for building multi-tenant apps,
     * where you can have multiple users and projects
     * sharing different configurations on the same app.
     *
     * When you define a binding dependency on another app,
     * it will automatically be linked to your StateSchema on
     * type generation. You can also `.extend` it to add more
     * fields to the state schema, like asking for an API Key
     * for connecting to a third-party service.
     */
    state: StateSchema,
  },
  tools,
  bindings: [
    {
      type: "mcp",
      name: "DATABASE",
      app_name: "@deco/postgres",
    },
    {
      type: "mcp",
      name: "EVENT_BUS",
      app_name: "@deco/event-bus",
    },
  ],
});

export default runtime;
