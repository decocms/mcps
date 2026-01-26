/**
 * Type definitions for the Slides MCP environment.
 *
 * This file defines the state schema including optional binding
 * for the Brand MCP which handles brand research and design system generation.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Brand MCP binding schema - matches the actual tools from Brand MCP
 *
 * Brand MCP exposes BRAND_CREATE which is the main entry point.
 * The input schema must match exactly what the tool expects.
 */
const BrandBindingSchema = [
  {
    name: "BRAND_CREATE",
    inputSchema: {
      type: "object",
      properties: {
        brandName: { type: "string", description: "Brand or company name" },
        websiteUrl: { type: "string", description: "Brand website URL" },
      },
      required: ["brandName", "websiteUrl"],
    },
  },
] as const;

/**
 * State schema with optional Brand MCP binding.
 *
 * When the BRAND binding is configured, Slides can use brand research
 * capabilities from the Brand MCP to automatically discover brand identity
 * and generate design systems for presentations.
 */
export const StateSchema = z.object({
  /**
   * Optional Brand MCP binding for brand research.
   * Matches connections with the BRAND_CREATE tool.
   */
  BRAND: z
    .object({
      __type: z.literal("@deco/brand").default("@deco/brand"),
      __binding: z.literal(BrandBindingSchema).default(BrandBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe(
      "Brand MCP for brand research and design system generation - requires BRAND_CREATE tool",
    ),
});

/**
 * Registry type for the bindings.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
