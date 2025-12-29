/**
 * Central export point for all Grain tools.
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the modular organization.
 */

import { createListRecordingsTool } from "./list-recordings.ts";
import { createGetRecordingTool } from "./get-recording.ts";

// Export all tools
export const tools = [createListRecordingsTool, createGetRecordingTool];
