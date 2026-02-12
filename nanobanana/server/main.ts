/**
 * Nano Banana MCP - Image Generation Server
 *
 * Entry point for the MCP server that generates images
 * using Gemini models via OpenRouter.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * State Schema defines the configuration users provide during installation
 */
export const StateSchema = z.object({
  NANOBANANA_API_KEY: z
    .string()
    .describe(
      "OpenRouter API key for accessing Gemini image generation models",
    ),
});

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
