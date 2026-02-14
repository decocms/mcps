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
 *
 * Optionally uses VTEX binding to fetch product images from VTEX catalog.
 */
export const StateSchema = z.object({
  IMAGE_GENERATOR: BindingOf("*").describe(
    "Image generator binding (any MCP that provides GENERATE_IMAGE tool).",
  ),
  VTEX: BindingOf("vtex")
    .optional()
    .describe(
      "VTEX binding (provides VTEX_GET_SKU_IMAGES_PUBLIC tool for fetching product images).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
