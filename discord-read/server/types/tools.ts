/**
 * Tool Type Definitions
 *
 * Types for MCP tools.
 * Note: Type errors on inputSchema/outputSchema are expected due to
 * @decocms/runtime using internal Zod types not compatible with public Zod.
 * The code works correctly at runtime.
 */

/**
 * Tool factory function type
 */
export type ToolFactory<TEnv> = (env: TEnv) => unknown;

/**
 * Tool collection type
 */
export type ToolCollection<TEnv> = ToolFactory<TEnv>[];
