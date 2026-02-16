/**
 * Environment Type Definitions
 *
 * This file defines the StateSchema (configuration form in Mesh UI)
 * and the Env type used throughout your MCP.
 */

import type { DefaultEnv } from "@decocms/runtime";
// import { BindingOf } from "@decocms/runtime"; // Uncomment when using bindings
import { z } from "zod";

/**
 * State Schema - Configuration form for your MCP
 *
 * Users fill this form when installing your MCP in Mesh.
 * Organize fields by category for better UX (see examples below).
 */
export const StateSchema = z.object({
  // ========================================
  // 1. BINDINGS (optional, uncomment if needed)
  // ========================================
  // EVENT_BUS: BindingOf("@deco/event-bus").optional(),
  // DATABASE: BindingOf("@deco/postgres"),
  // MODEL_PROVIDER: BindingOf("@deco/llm")
  //   .optional()
  //   .describe("AI Model Provider connection"),
  // ========================================
  // 2. API CREDENTIALS (example)
  // ========================================
  // API_CREDENTIALS: z
  //   .object({
  //     API_KEY: z.string().describe("Your API key from the provider dashboard"),
  //     API_SECRET: z.string().optional().describe("Your API secret (optional)"),
  //   })
  //   .describe("Service authentication credentials"),
  // ========================================
  // 3. CONFIGURATION OPTIONS (example)
  // ========================================
  // FEATURE_CONFIG: z
  //   .object({
  //     ENABLED: z.boolean().default(true).describe("Enable this feature"),
  //     MAX_ITEMS: z.number().default(100).describe("Maximum items to process"),
  //   })
  //   .optional()
  //   .describe("Feature configuration settings"),
  // ========================================
  // 4. SIMPLE FIELDS (example)
  // ========================================
  // CONNECTION_NAME: z
  //   .string()
  //   .optional()
  //   .describe("Friendly name for this connection (appears in logs)"),
});

/**
 * Environment Type
 *
 * This type is used throughout your MCP to access configuration,
 * bindings, and the Mesh request context.
 */
export type Env = DefaultEnv<typeof StateSchema>;
