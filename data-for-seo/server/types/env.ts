/**
 * Environment Type Definitions
 *
 * This file defines the StateSchema (configuration form in Mesh UI)
 * and the Env type used throughout your MCP.
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * State Schema - Configuration form for your MCP
 *
 * Users fill this form when installing your MCP in Mesh.
 * DataForSEO credentials are required for API access.
 */
export const StateSchema = z.object({
  // ========================================
  // DataForSEO API CREDENTIALS
  // ========================================
  API_CREDENTIALS: z
    .object({
      login: z
        .string()
        .describe(
          "DataForSEO API Login from https://app.dataforseo.com/api-access",
        ),
      password: z
        .string()
        .describe(
          "DataForSEO API Password/Token from https://app.dataforseo.com/api-access (NOT your account password)",
        ),
    })
    .describe("DataForSEO authentication credentials"),
});

/**
 * Environment Type
 *
 * This type is used throughout your MCP to access configuration,
 * bindings, and the Mesh request context.
 */
export type Env = DefaultEnv<typeof StateSchema>;
