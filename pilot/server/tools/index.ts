/**
 * Tools Index
 *
 * Exports all local tools available to the Pilot agent.
 */

import { systemTools } from "./system.ts";
import { speechTools } from "./speech.ts";
import type { Tool } from "./system.ts";

export type { Tool, ToolResult } from "./system.ts";

/**
 * Get all local tools
 */
export function getAllLocalTools(): Tool[] {
  return [...systemTools, ...speechTools];
}
