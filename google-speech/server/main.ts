/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * your MCP server at /mcp.
 */
import { z } from "zod";
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * State schema for Google Speech MCP configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = BaseStateSchema.extend({
  apiKey: z
    .string()
    .describe(
      "Google Cloud API Key para Text-to-Speech e Speech-to-Text (obter em https://console.cloud.google.com/apis/credentials)",
    ),
  defaultLanguage: z
    .string()
    .optional()
    .describe(
      "Idioma padrão para conversão (ex: pt-BR, en-US, es-ES). Se não especificado, será pt-BR.",
    ),
  defaultVoice: z
    .string()
    .optional()
    .describe(
      "Voz padrão para Text-to-Speech (ex: pt-BR-Standard-A). Se não especificado, será usada uma voz padrão.",
    ),
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
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    state: z.infer<typeof StateSchema>;
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
    scopes: [],
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
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => {
    if (env.ASSETS?.fetch) {
      return env.ASSETS.fetch(req);
    }
    return new Response("Not Found", { status: 404 });
  },
});

export default runtime;
