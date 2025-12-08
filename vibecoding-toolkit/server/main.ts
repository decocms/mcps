import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./collections/index.ts";
import { insertDefaultWorkflowIfNotExists } from "./tools/workflow.ts";

export type Env = DefaultEnv<typeof StateSchema> &
  DecoEnv & {
    BASE_URL: string;
    DATABASE: {
      DATABASES_RUN_SQL: (params: {
        sql: string;
        params: unknown[];
      }) => Promise<{ result: { results: unknown[] }[] }>;
    };
    AUTH: {
      CALL_TOOL: (params: {
        connection: string;
        tool: string;
        arguments: Record<string, unknown>;
      }) => Promise<{ response: unknown }>;
    };
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    onChange: async (env) => {
      console.log("onChange", env);
      try {
        await ensureCollections(env);
        await ensureIndexes(env);
        await insertDefaultWorkflowIfNotExists(env);
      } catch (error) {
        console.error("error ensuring collections", error);
      }

      console.log("collections ensured");
    },
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: [Scopes.DATABASE.DATABASES_RUN_SQL, Scopes.AUTH.CALL_TOOL],
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
      app_name: "@deco/database",
    },
    {
      type: "mcp",
      name: "AUTH",
      app_name: "@deco/auth",
    },
  ],
  cors: {
    origin: (origin: string) => {
      // Allow localhost and configured origins
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return origin;
      }
      // TODO: Configure allowed origins from environment
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "mcp-protocol-version"],
  },
});

export default {
  fetch: (req: Request) => {
    const url = new URL(req.url);

    if (url.pathname === "/_healthcheck") {
      return new Response("OK", { status: 200 });
    }

    return runtime.fetch(
      req,
      { ...process.env, BASE_URL: url.href } as Env,
      {},
    );
  },
};
