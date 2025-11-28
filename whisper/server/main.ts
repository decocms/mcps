/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * your MCP server at /mcp.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";

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
    OPENAI_API_KEY: string;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app, you will be able to use the
     * required bindings.
     *
     * Note: WHISPER_CONTRACT scopes will be added here once
     * the contract is configured in the Deco platform.
     */
    scopes: [
      Scopes.WHISPER_CONTRACT.CONTRACT_AUTHORIZE,
      Scopes.WHISPER_CONTRACT.CONTRACT_SETTLE,
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
});

export default runtime;
