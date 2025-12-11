import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./collections/index.ts";
import { insertDefaultWorkflowIfNotExists } from "./tools/workflow/workflow.ts";
import { ensureCronScheduler } from "./lib/cron-scheduler.ts";
import { processEnqueuedExecutions } from "./lib/execution-db.ts";

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
      try {
        await ensureCollections(env);
        await ensureIndexes(env);
        await insertDefaultWorkflowIfNotExists(env);

        // Set up pg_cron job to process enqueued workflows
        // Use host.docker.internal for Docker to reach the host machine
        const baseUrl = env.BASE_URL || "http://host.docker.internal:3000";
        const processEndpoint = `${baseUrl}/api/process-workflows`;
        await ensureCronScheduler(env, processEndpoint);
      } catch (error) {
        console.error("error ensuring collections", error);
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
  ],
  /**
   * Custom HTTP routes handler.
   * Handles /api/process-workflows for pg_cron to trigger workflow processing.
   */
  fetch: async (req: Request, env: Env) => {
    const url = new URL(req.url);
    // pg_cron calls this endpoint to process enqueued workflows
    if (url.pathname === "/api/process-workflows" && req.method === "POST") {
      try {
        const processedIds = await processEnqueuedExecutions(env);
        return new Response(
          JSON.stringify({
            success: true,
            processed: processedIds.length,
            ids: processedIds,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("[CRON] Error processing workflows:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Fall through for other requests (return 404 or handle assets if available)
    return new Response("Not found", { status: 404 });
  },
});

export default runtime;
