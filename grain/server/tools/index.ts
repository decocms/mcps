/**
 * Central export point for all Grain tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the modular organization.
 *
 * Modules:
 * - recordingTools: List, get, and access meeting recordings and transcripts
 */

import { recordingTools } from "./recordings.ts";

// Export all tools from all modules
export const tools = [
  // Recording and transcript tools
  ...recordingTools,
];
