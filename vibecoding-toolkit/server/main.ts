/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { views } from "./views.ts";
import { Queue } from "@cloudflare/workers-types";
import { createClient } from "@decocms/runtime/client";

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    POSTGRES: {
      RUN_SQL: (params: {
        query: string;
        params: any[];
      }) => Promise<{ rows: any[]; rowCount: number }>;
    };
    WORKFLOW_QUEUE: Queue<any>;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: Object.values(Scopes).flatMap((scope) => Object.values(scope)),
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
  views,
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default {
  ...runtime,
  async queue(
    batch: MessageBatch<{ executionId: string; ctx: any }>,
    env: Env,
  ) {
    for (const message of batch.messages) {
      const ctx = message.body.ctx;
      console.log({ ctx });
      try {
        const response = await fetch(
          "https://localhost-c11ba5a9.deco.host" +
            "/mcp/call-tool/START_EXECUTION",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ctx.DECO_REQUEST_CONTEXT.token}`,
              "Content-Type": "application/json",
              "X-Deco-MCP-Client": "true",
            },
            credentials: "include",
            body: JSON.stringify({
              executionId: message.body.executionId,
            }),
          },
        );
        // console.log({ response });
        if (!response.ok) {
          throw new Error(`Failed to start execution: ${response.statusText}`);
        }
        const data = await response.json();
        console.log({ data });
        return { success: true };
      } catch (error) {
        console.error({ error });
      }
    }
  },
};
