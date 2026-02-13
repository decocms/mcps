/**
 * Tools Export
 *
 * Exports all tools that implement the Reports Binding:
 * - REPORTS_LIST (required)
 * - REPORTS_GET (required)
 * - REPORTS_UPDATE_STATUS (optional)
 */

import { createReportsGetTool } from "./reports-get.ts";
import { createReportsListTool } from "./reports-list.ts";
import { createReportsUpdateStatusTool } from "./reports-update-status.ts";

export const tools = [
  createReportsListTool,
  createReportsGetTool,
  createReportsUpdateStatusTool,
];
