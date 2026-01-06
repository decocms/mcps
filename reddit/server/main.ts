/**
 * This is the main entry point for the Reddit MCP server.
 * This is a Cloudflare workers app, and serves your MCP server at /mcp.
 *
 * This MCP provides tools to interact with Reddit:
 * - GET_SUBREDDIT_POSTS: Fetch posts from a specific subreddit
 * - SEARCH_REDDIT: Search for posts across Reddit or within a subreddit
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * State schema for Reddit MCP configuration.
 * No API key required - uses Reddit's public JSON API.
 */
export const StateSchema = BaseStateSchema.extend({});

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
     * Reddit public API doesn't require authentication.
     */
    scopes: [],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like.
     * No configuration needed for Reddit public API.
     */
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   */
  fetch: (req: Request, env: Env) => env.ASSETS.fetch(req),
});

export default runtime;
