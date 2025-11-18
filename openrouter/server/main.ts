/**
 * OpenRouter MCP Server
 *
 * This MCP provides tools for interacting with OpenRouter's API,
 * including model discovery, comparison, and AI chat completions.
 *
 * OpenRouter offers a unified API for accessing hundreds of AI models
 * with built-in fallback mechanisms, cost optimization, and provider routing.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";
import { z } from "zod";

import { tools } from "./tools/index.ts";
import { handleCustomRoutes } from "./routes/index.ts";

/**
 * State Schema defines the configuration users provide during installation
 */
export const StateSchema = BaseStateSchema.extend({
  // Default generation parameters
  defaultTemperature: z
    .number()
    .min(0)
    .max(2)
    .default(1)
    .optional()
    .describe(
      "Default temperature for model responses (0-2, higher is more random). Default: 1",
    ),

  defaultMaxTokens: z
    .number()
    .positive()
    .optional()
    .describe(
      "Default maximum tokens for responses (leave empty to use model defaults)",
    ),
});

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    OPENROUTER_API_KEY: string;
    state: z.infer<typeof StateSchema>;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [
      Scopes.OPENROUTER_CHAT_CONTRACT.CONTRACT_AUTHORIZE,
      Scopes.OPENROUTER_CHAT_CONTRACT.CONTRACT_SETTLE,
    ],
    state: StateSchema,
  },
  tools,

  /**
   * Custom fetch handler for API routes and assets
   * Handles streaming endpoints and other custom routes
   */
  fetch: async (req: Request, env: Env) => {
    const url = new URL(req.url);

    // Handle custom API routes (streaming, etc.)
    if (url.pathname.startsWith("/api/")) {
      const response = await handleCustomRoutes(req, env);
      if (response) return response;
    }

    // Fallback to assets
    return env.ASSETS.fetch(req);
  },
});

export default runtime;
