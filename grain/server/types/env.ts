/**
 * Environment Type Definitions
 *
 * Central definition for the Env type used throughout the Grain MCP.
 */

import {
  BindingOf,
  type BindingRegistry,
  type DefaultEnv,
} from "@decocms/runtime";
import z from "zod";

/**
 * State schema defining the required bindings
 */
export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
});

/**
 * Binding registry for type safety
 */
export interface Registry extends BindingRegistry {
  "@deco/postgres": [
    {
      name: "DATABASES_RUN_SQL";
      description: "Run a SQL query against the database";
      inputSchema: z.ZodType<{
        sql: string;
        params?: unknown[];
      }>;
      outputSchema: z.ZodType<{
        result: {
          results?: unknown[];
          success?: boolean;
        }[];
      }>;
    },
  ];
}

/**
 * Environment type combining Deco bindings
 * Includes DATABASE binding for indexing recordings via webhooks
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
