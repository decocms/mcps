/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * your MCP server at /mcp.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { type Env as DecoEnv, StateSchema } from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

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
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it.
     */
    scopes: [],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like. When a user
     * is installing your App, they will have to fill in
     * a form with the fields defined in the state schema.
     */
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default runtime;
