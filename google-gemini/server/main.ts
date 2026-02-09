/**
 * Google Gemini MCP Server
 *
 * This MCP provides tools for interacting with Google's Gemini API,
 * including model discovery, comparison, and AI chat completions.
 *
 * Gemini offers a family of multimodal AI models with varying capabilities,
 * from lightweight flash models to powerful pro models.
 */
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import { tools } from "./tools/index.ts";

const StateSchema = z.object({});

/**
 * Environment type combining Deco bindings and runtime context
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

const runtime = withRuntime<Env, typeof StateSchema>({
  tools,
  prompts: [],
});

serve(runtime.fetch);
