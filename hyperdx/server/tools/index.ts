/**
 * Central export point for all tools organized by domain.
 */
import type { Env } from "../main.ts";
import {
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
} from "./hyperdx.ts";

// Export all tools as a function that receives env and creates the tools
export const tools = (env: Env) => [
  createSearchLogsTool(env),
  createGetLogDetailsTool(env),
  createQueryChartDataTool(env),
];
