/**
 * Tools Index
 *
 * Exports all tools available to the Pilot agent.
 */

export * from "./system.ts";
export * from "./speech.ts";

import { systemTools } from "./system.ts";
import { speechTools } from "./speech.ts";
import type { Tool } from "./system.ts";

/**
 * Get all local tools
 */
export function getAllLocalTools(): Tool[] {
  return [...systemTools, ...speechTools];
}
