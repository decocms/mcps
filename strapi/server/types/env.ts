/**
 * Environment Type Definitions
 *
 * This file defines the StateSchema (configuration form in Mesh UI)
 * and the Env type used throughout the Strapi MCP.
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * State Schema - Configuration form for Strapi MCP
 *
 * Users fill this form when installing the MCP in Mesh.
 * Only the Strapi API endpoint is required - the token comes via Authorization header.
 */
export const StateSchema = z.object({
  // ========================================
  // STRAPI API ENDPOINT
  // ========================================
  STRAPI_API_ENDPOINT: z
    .string()
    .url()
    .describe(
      "Strapi API base URL (e.g., https://your-strapi.com or https://your-strapi.com/api)",
    ),
});

/**
 * Environment Type
 *
 * This type is used throughout the MCP to access configuration,
 * bindings, and the Mesh request context.
 */
export type Env = DefaultEnv<typeof StateSchema>;
