/**
 * Content Scraper MCP
 *
 * This MCP extracts, deduplicates, and summarizes web content from URLs.
 * Uses Firecrawl for content extraction and Supabase for state persistence.
 */
import { z } from "zod";
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * State schema for Content Scraper MCP configuration.
 * Users fill these values when installing the MCP.
 * Supabase storage is provided via MCP binding (SUPABASE).
 */
export const StateSchema = BaseStateSchema.extend({
  firecrawlApiKey: z
    .string()
    .describe("Firecrawl API key for content extraction"),
});

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv &
  DecoEnv & {
    state: z.infer<typeof StateSchema>;
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
    scopes: [
      Scopes.CONTENT_CONTRACT.CONTRACT_AUTHORIZE,
      Scopes.CONTENT_CONTRACT.CONTRACT_SETTLE,
    ],
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
   */
  fetch: (req: Request, env: Env) => env.ASSETS.fetch(req),
});

export default runtime;
