/**
 * This is the main entry point for the Discord Bot MCP server.
 * This is a Cloudflare workers app, and serves your MCP server at /mcp.
 */
import { z } from "zod";
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { handleDiscordWebhook } from "./lib/webhook-handler.ts";

/**
 * State schema for Discord Bot MCP configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = BaseStateSchema.extend({
  botToken: z
    .string()
    .describe(
      "Discord Bot Token from Developer Portal (https://discord.com/developers/applications)",
    ),
  discordPublicKey: z
    .string()
    .describe(
      "Discord Application Public Key from Developer Portal (required for webhook interactions)",
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
   * Custom fetch handler to handle webhooks and fallback to assets
   */
  fetch: async (req: Request, env: Env) => {
    const url = new URL(req.url);

    // Rota para receber webhooks do Discord
    if (url.pathname === "/discord/webhook" && req.method === "POST") {
      return await handleDiscordWebhook(req, env);
    }

    // Fallback para assets (se disponível)
    if (env.ASSETS) {
      return env.ASSETS.fetch(req);
    }

    // Resposta padrão se ASSETS não estiver disponível
    return new Response("Not Found", { status: 404 });
  },
});

export default runtime;
