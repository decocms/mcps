/**
 * Type definitions for the Slides MCP environment.
 *
 * Uses bindings matched by tool format, not specific MCP names.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Brand MCP binding - matches any MCP with BRAND_CREATE tool
 */
const BrandBindingSchema = [
  {
    name: "BRAND_CREATE",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "BRAND_DISCOVER",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

/**
 * State schema with bindings matched by tool format.
 */
export const StateSchema = z.object({
  /**
   * Brand MCP binding - any MCP with BRAND_CREATE/BRAND_DISCOVER tools
   */
  BRAND: z
    .object({
      __type: z.literal("binding").default("binding"),
      __binding: z.literal(BrandBindingSchema).default(BrandBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("Brand research - requires BRAND_CREATE and BRAND_DISCOVER"),
});

/**
 * Registry type for the bindings.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
