/**
 * Type definitions for the Slides MCP environment.
 *
 * This file defines the state schema including optional binding
 * for the Brand MCP which handles brand research and design system generation.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Brand MCP binding schema - matches the actual tool names from Brand MCP
 *
 * Brand MCP exposes: BRAND_CREATE, BRAND_DISCOVER, BRAND_GENERATE, BRAND_STATUS
 */
const BrandBindingSchema = [
  {
    name: "BRAND_CREATE",
    inputSchema: {
      type: "object",
      properties: {
        brandName: { type: "string" },
        websiteUrl: { type: "string" },
      },
      required: ["brandName"],
    },
  },
  {
    name: "BRAND_DISCOVER",
    inputSchema: {
      type: "object",
      properties: {
        brandName: { type: "string" },
        websiteUrl: { type: "string" },
      },
      required: ["brandName"],
    },
  },
  {
    name: "BRAND_GENERATE",
    inputSchema: {
      type: "object",
      properties: {
        identity: { type: "object" },
        outputFormat: { type: "string" },
      },
      required: ["identity"],
    },
  },
  {
    name: "BRAND_STATUS",
    inputSchema: {
      type: "object",
      properties: {},
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
   * Provides: BRAND_CREATE, BRAND_DISCOVER, BRAND_GENERATE, BRAND_STATUS
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
