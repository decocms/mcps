/**
 * Environment Type Definitions for Nano Banana MCP
 */

import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * Configuration state for this MCP.
 *
 * Uses contract and file system bindings for authorization/billing
 * and image storage respectively.
 */
export const StateSchema = z.object({
  // ========================================
  // 1. BINDINGS
  // ========================================
  NANOBANANA_CONTRACT: BindingOf(
    "@deco/nanobanana-1015fd7069e194c8463a93ff7e5070d1",
  ).describe("Contract binding for authorization and billing"),

  FILE_SYSTEM: BindingOf("@deco/file-system").describe(
    "File system binding for storing generated images",
  ),

  // ========================================
  // 2. CREDENTIALS
  // ========================================
  NANOBANANA_API_KEY: z
    .string()
    .describe(
      "OpenRouter API key for accessing Gemini image generation models",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
