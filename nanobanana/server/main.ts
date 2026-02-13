/**
 * Nano Banana MCP - Image Generation Server
 *
 * Entry point for the MCP server that generates images
 * using Gemini models via OpenRouter.
 */
import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * State Schema defines the configuration users provide during installation.
 *
 * FILE_SYSTEM is a binding to @deco/file-system for image storage.
 * NANOBANANA_API_KEY is the OpenRouter API key provided by the user.
 */
export const StateSchema = z.object({
  FILE_SYSTEM: BindingOf("@deco/file-system").describe(
    "File system binding for storing generated images.",
  ),
  NANOBANANA_API_KEY: z
    .string()
    .describe(
      "OpenRouter API key for accessing Gemini image generation models",
    ),
});

/**
 * Environment type derived from the state schema.
 * DefaultEnv resolves bindings (like FILE_SYSTEM) into
 * their actual MCP client interfaces at runtime.
 */
export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    scopes: ["FILE_SYSTEM::FS_READ", "FILE_SYSTEM::FS_WRITE"],
  },
  tools,
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
