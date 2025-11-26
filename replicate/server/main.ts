/**
 * Replicate MCP Server
 *
 * This MCP provides tools for interacting with Replicate's API,
 * including running AI models, managing predictions, and browsing the model catalog.
 *
 * Uses contract-based billing for API usage metering.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * State Schema defines the configuration users provide during installation
 */
export const StateSchema = BaseStateSchema;

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    state: z.infer<typeof StateSchema>;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * Request contract permissions for Replicate API usage billing
     * Note: After updating wrangler.toml, run build to regenerate scopes
     */
    scopes: [
      Scopes.REPLICATE_API_CONTRACT?.CONTRACT_AUTHORIZE,
      Scopes.REPLICATE_API_CONTRACT?.CONTRACT_SETTLE,
    ],
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default runtime;
