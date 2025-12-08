/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { createTextToSpeechTool } from "./text-to-speech.ts";
import { createSpeechToTextTool } from "./speech-to-text.ts";

/**
 * Export all tools from all domains
 */
export const tools = [createTextToSpeechTool, createSpeechToTextTool];
