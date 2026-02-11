/**
 * Central export point for all Google Analytics tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - propertyTools: Property and data stream management (list, get)
 * - reportTools: Reports and analytics (run reports, realtime reports, common reports)
 */

import { propertyTools } from "./properties.ts";
import { reportTools } from "./reports.ts";

// Export all tools from all modules
export const tools = [
  // Property management tools
  ...propertyTools,
  // Reporting and analytics tools
  ...reportTools,
];
