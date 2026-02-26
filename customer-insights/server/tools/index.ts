/**
 * Tool Registry
 *
 * Exports the list of all MCP tool factory functions. Each factory receives
 * the runtime Env and returns a configured tool instance. Tools registered:
 * upload-csv, airtable-sync, billing, usage, timeline, emails, summary,
 * invoice-explainer, health-list, risk-score.
 */

import { createUploadCsvTool } from "./upload-csv.ts";
import { createAirtableSyncTool } from "./airtable-sync.ts";
import { createBillingTool } from "./billing.ts";
import { createCustomerEmailsTool } from "./emails.ts";
import { createSummaryTool } from "./summary.ts";
import { createSummaryGenerateTool } from "./summary-generate.ts";
import { createTimelineTool } from "./timeline.ts";
import { createUsageTool } from "./usage.ts";
import { createInvoiceExplainerTool } from "./invoice-explainer.ts";
import { createHealthListTool } from "./health-list.ts";
import { createRiskScoreTool } from "./risk-score.ts";

export const tools = [
  createUploadCsvTool,
  createAirtableSyncTool,
  createBillingTool,
  createUsageTool,
  createTimelineTool,
  createCustomerEmailsTool,
  createSummaryGenerateTool,
  createSummaryTool,
  createInvoiceExplainerTool,
  createHealthListTool,
  createRiskScoreTool,
];
