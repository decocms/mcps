/**
 * Content Scraper MCP
 *
 * Simple MCP that scrapes web content via n8n webhook.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { type Env as DecoEnv, StateSchema } from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 */
export type Env = DefaultEnv & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [],
    state: StateSchema,
  },
  tools,
  fetch: (req: Request, env: Env) =>
    (env as Env & { ASSETS: { fetch: typeof fetch } }).ASSETS.fetch(req),
});

export default runtime;
