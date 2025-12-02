/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import type { Env } from "../main.ts";
import { userTools } from "@decocms/mcps-shared/tools/user";
import { createTextToSpeechTool } from "./text-to-speech.ts";
import { createSpeechToTextTool } from "./speech-to-text.ts";

/**
 * Create and export all tools, passing the env context to Google Speech tools
 */
export const tools = (env: Env) =>
  [
    ...userTools,
    createTextToSpeechTool(env),
    createSpeechToTextTool(env),
  ] as any;

// Re-export for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
