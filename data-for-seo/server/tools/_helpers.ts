import type { Env } from "../types/env.ts";

/**
 * Helper to log tool execution with env context
 */
export function logToolExecution(toolId: string, env: Env): void {
  console.log(`[${toolId}] Executing...`);
  console.log(
    `[${toolId}] env.MESH_REQUEST_CONTEXT:`,
    !!env.MESH_REQUEST_CONTEXT,
  );
  console.log(
    `[${toolId}] env.MESH_REQUEST_CONTEXT.state:`,
    !!env.MESH_REQUEST_CONTEXT?.state,
  );
  console.log(
    `[${toolId}] env.MESH_REQUEST_CONTEXT.state.API_CREDENTIALS:`,
    !!env.MESH_REQUEST_CONTEXT?.state?.API_CREDENTIALS,
  );
}

/**
 * Helper to log successful tool completion
 */
export function logToolSuccess(toolId: string): void {
  console.log(`[${toolId}] ✅ Success`);
}

/**
 * Helper to log tool error
 */
export function logToolError(toolId: string, error: unknown): void {
  console.log(`[${toolId}] ❌ Error:`, String(error));
}
