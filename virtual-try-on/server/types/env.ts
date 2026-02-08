/**
 * Environment Type Definitions for Virtual Try-On MCP
 */

import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * Configuration state for this MCP.
 *
 * Uses a nanobanana binding to delegate image generation
 * via its GENERATE_IMAGE tool.
 */
export const StateSchema = z.object({
  NANOBANANA: BindingOf("@deco/nanobanana").describe(
    "Nanobanana image generator binding.",
  ),
});

export type Env = DefaultEnv<typeof StateSchema>;
