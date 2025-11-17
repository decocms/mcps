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
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";
import { z } from "zod";

import { tools } from "./tools/index.ts";
import { handleCustomRoutes } from "./routes/index.ts";

/**
 * State Schema defines the configuration users provide during installation
 */
export const StateSchema = BaseStateSchema.extend({
  apiKey: z
    .string()
    .describe(
      "Your OpenRouter API Key (get it from https://openrouter.ai/keys)",
    ),

  // Optional fields for app attribution on openrouter.ai
  siteName: z
    .string()
    .optional()
    .describe(
      "Your site name for rankings on openrouter.ai (optional, helps with discovery)",
    ),

  siteUrl: z
    .string()
    .optional()
    .describe(
      "Your site URL for rankings on openrouter.ai (optional, also used for streaming endpoints)",
    ),

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
    state: z.infer<typeof StateSchema>;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    scopes: [], // No special OAuth scopes needed
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
