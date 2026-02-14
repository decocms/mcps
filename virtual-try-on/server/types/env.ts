/**
 * Environment Type Definitions for Virtual Try-On MCP
 */

import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * Configuration state for this MCP.
 *
 * Uses any image generator binding that provides a GENERATE_IMAGE tool
 * to delegate image generation.
 */
export const StateSchema = z.object({
  IMAGE_GENERATOR: BindingOf("*").describe(
    "Image generator binding (any MCP that provides GENERATE_IMAGE tool).",
  ),
});

export type Env = DefaultEnv<typeof StateSchema>;
