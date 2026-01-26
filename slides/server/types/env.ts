/**
 * Environment Type Definitions for Slides MCP
 *
 * Uses BindingOf with tool-based matching via Registry.
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

/**
 * Registry defines the tool signatures for each binding type.
 * Connections with matching tools will be shown as options.
 */
export interface Registry extends BindingRegistry {
  "@deco/brand": [
    {
      name: "BRAND_CREATE";
      inputSchema: z.ZodType<{ brandName: string; websiteUrl?: string }>;
    },
    {
      name: "BRAND_DISCOVER";
      inputSchema: z.ZodType<{ brandName: string; websiteUrl?: string }>;
      opt?: true;
    },
  ];
}

/**
 * State schema using BindingOf for clean binding declarations.
 */
export const StateSchema = z.object({
  BRAND: BindingOf<Registry, "@deco/brand">("@deco/brand")
    .optional()
    .describe("Brand research - any MCP with BRAND_CREATE tool"),
});

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
