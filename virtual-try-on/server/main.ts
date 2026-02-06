/**
 * Virtual Try-On MCP
 *
 * Receives a person photo + garment images and delegates generation to an image generator MCP.
 */
import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";
import type { Registry } from "@decocms/mcps-shared/registry";

import { tools } from "./tools/index.ts";

/**
 * Configuration state for this MCP.
 *
 * Supports two integration modes:
 * - Connection binding (`@deco/connection`) + connectionId
 * - Direct generator MCP URL + optional token/headers
 */
export const StateSchema = z.object({
  CONNECTION: BindingOf("@deco/connection")
    .optional()
    .describe(
      "Optional: Deco Mesh connection manager. Used to fetch the generator MCP url/token by connection id.",
    ),
  // Prefer using Deco's connection manager when running inside Mesh.
  generatorConnectionId: z
    .string()
    .optional()
    .describe(
      "Optional: Connection ID (from Deco Mesh) pointing to an image generator MCP (e.g., nanobanana).",
    ),

  // Direct mode (works outside Mesh).
  generatorMcpUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional: Direct URL to the image generator MCP endpoint (usually ends with /mcp). Overrides generatorConnectionId.",
    ),
  generatorAuthToken: z
    .string()
    .optional()
    .describe(
      "Optional: Bearer token for the generator MCP (sent as Authorization: Bearer ...).",
    ),
  generatorToolName: z
    .string()
    .default("GENERATE_IMAGE")
    .describe(
      "Tool name to call on the generator MCP (default: GENERATE_IMAGE).",
    ),
  defaultModel: z
    .string()
    .default("gemini-2.5-flash-image-preview")
    .describe(
      "Default model to send to the generator (used when the generator tool requires a model field).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

if (runtime.fetch) {
  const port = Number(process.env.PORT || 8001);
  console.log(`Started development server: http://localhost:${port}`);
  serve(runtime.fetch);
}
