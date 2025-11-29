/**
 * VTEX MCP Server
 * 
 * This is the main entry point for the VTEX MCP server.
 * It provides tools for interacting with VTEX commerce APIs including:
 * - Product search and retrieval
 * - Shopping cart management
 * - Search suggestions
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema,
} from "../shared/deco.gen.ts";

import { vtexTools } from "./tools/index.ts";
import { userTools } from "@decocms/mcps-shared/tools/user";

// Combine VTEX tools with shared user tools
const tools = [...userTools, ...vtexTools];

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
     *
     * For VTEX, users need to provide:
     * - account: VTEX account name
     * - environment: VTEX environment (default: vtexcommercestable)
     * - salesChannel: Sales channel ID (default: 1)
     * - locale: Default locale (default: pt-BR)
     * - currency: Currency code (default: BRL)
     */
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default runtime;

