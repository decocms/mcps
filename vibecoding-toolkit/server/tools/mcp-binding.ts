/**
 * MCP Binding Implementation
 *
 * Implements the MCP_BINDING from @decocms/bindings/mcp:
 * - MCP_CONFIGURATION: Returns the MCP's configuration including scopes and state schema
 *
 * This exposes the MCP's capabilities to other services that want to discover
 * what this MCP offers, including its available scopes and the state schema
 * (formState) that users need to configure when installing this MCP.
 */

import {
  MCP_BINDING,
  McpConfigurationOutputSchema,
} from "@decocms/bindings/mcp";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Env } from "../main.ts";
import { Scopes, StateSchema } from "../../shared/deco.gen.ts";

// ============================================================================
// Types
// ============================================================================

// Extract binding schema
const CONFIGURATION_BINDING = MCP_BINDING.find(
  (b) => b.name === "MCP_CONFIGURATION",
);

if (
  !CONFIGURATION_BINDING?.inputSchema ||
  !CONFIGURATION_BINDING?.outputSchema
) {
  throw new Error("MCP_CONFIGURATION binding not found or missing schemas");
}

// ============================================================================
// Extended State Schema for FormState
// ============================================================================

/**
 * The complete state schema that users will fill when installing this MCP.
 * This extends the base StateSchema from deco.gen.ts with additional fields
 * for PostgreSQL configuration.
 */
export const ExtendedStateSchema = StateSchema.extend({
  postgresConnectionString: z
    .string()
    .describe(
      "PostgreSQL connection string (e.g., postgres://user:password@host:port/database)",
    ),
});

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * MCP_CONFIGURATION - Returns the MCP's configuration
 *
 * This tool exposes:
 * - scopes: All available scopes/permissions that this MCP offers
 * - stateSchema: The JSON Schema defining what users need to configure (formState)
 */
export const createMcpConfigurationTool = (_env: Env) =>
  createPrivateTool({
    id: "MCP_CONFIGURATION",
    description:
      "Get the MCP configuration including available scopes and state schema for installation",
    inputSchema: CONFIGURATION_BINDING.inputSchema,
    outputSchema: McpConfigurationOutputSchema,
    execute: async () => {
      // Collect all available scopes from the generated Scopes object
      const allScopes: string[] = [];

      for (const bindingScopes of Object.values(Scopes)) {
        for (const scopeValue of Object.values(
          bindingScopes as Record<string, string>,
        )) {
          allScopes.push(scopeValue);
        }
      }

      // Convert the Zod schema to JSON Schema (draft-07)
      const stateJsonSchema = zodToJsonSchema(ExtendedStateSchema, {
        $refStrategy: "none",
        target: "jsonSchema7",
      });

      return {
        scopes: allScopes,
        stateSchema: stateJsonSchema as Record<string, unknown>,
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

/**
 * Creates all MCP binding tools.
 * Returns an array of tools that implement the MCP binding.
 */
export const createMcpBinding = (env: Env) => [createMcpConfigurationTool(env)];

/**
 * Export as tool factory functions for the tools array
 */
export const mcpBindingTools = [createMcpConfigurationTool];
