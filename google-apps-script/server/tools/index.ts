/**
 * Google Apps Script MCP Tools Index
 * Exports all tools from the various modules
 */
import { projectTools } from "./projects.ts";
import { scriptTools } from "./scripts.ts";
import { versionTools } from "./versions.ts";
import { deploymentTools } from "./deployments.ts";
import { processTools } from "./processes.ts";

export const tools = [
  ...projectTools,
  ...scriptTools,
  ...versionTools,
  ...deploymentTools,
  ...processTools,
];
