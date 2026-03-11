/**
 * Veo MCP - Video Generation Server
 *
 * Entry point for the MCP server that generates videos
 * using Google Gemini Veo models.
 */
import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * State Schema defines the configuration users provide during installation.
 *
 * OBJECT_STORAGE is a binding to @deco/object-storage for video storage.
 * GOOGLE_GENAI_API_KEY is the Google Gemini API key provided by the user.
 */
export const StateSchema = z.object({
  OBJECT_STORAGE: BindingOf("@deco/object-storage").describe(
    "Object storage binding (S3-compatible) for storing generated videos.",
  ),
  GOOGLE_GENAI_API_KEY: z
    .string()
    .describe(
      "Google Gemini API key for accessing Veo video generation models",
    ),
});

/**
 * Environment type derived from the state schema.
 * DefaultEnv resolves bindings (like OBJECT_STORAGE) into
 * their actual MCP client interfaces at runtime.
 *
 * Extended with DECO_REQUEST_CONTEXT and DECO_CHAT_WORKSPACE
 * required by createVideoGeneratorTools.
 */
export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
};

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    scopes: [
      "OBJECT_STORAGE::GET_PRESIGNED_URL",
      "OBJECT_STORAGE::PUT_PRESIGNED_URL",
    ],
  },
  tools,
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
