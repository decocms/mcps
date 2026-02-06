/**
 * Analysis Tools (Named Ranges, Pivot Tables)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

// ============================================
// Named Range Tools
// ============================================

export const createAddNamedRangeTool = (env: Env) =>
  createPrivateTool({
    id: "create_named_range",
    description:
      "Create a named range. Named ranges allow you to reference a range by a friendly name in formulas (e.g., =SUM(SalesData) instead of =SUM(A1:A100)).",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      name: z
        .string()
        .describe(
          "Name for the range (must be unique, no spaces, start with letter or underscore)",
        ),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addNamedRange(
        context.spreadsheetId,
        context.name,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
      );
      return {
        success: true,
        message: `Named range "${context.name}" created successfully`,
      };
    },
  });

export const createDeleteNamedRangeTool = (env: Env) =>
  createPrivateTool({
    id: "delete_named_range",
    description: "Delete a named range by its ID.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      namedRangeId: z.string().describe("Named range ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteNamedRange(
        context.spreadsheetId,
        context.namedRangeId,
      );
      return {
        success: true,
        message: `Named range ${context.namedRangeId} deleted`,
      };
    },
  });

// ============================================
// Pivot Table Tools
// ============================================

const PivotGroupSchema = z.object({
  sourceColumnOffset: z.coerce
    .number()
    .describe("Column offset within source range (0 = first column)"),
  showTotals: z.boolean().optional().describe("Show totals for this group"),
  sortOrder: z
    .enum(["ASCENDING", "DESCENDING"])
    .optional()
    .describe("Sort order"),
});

const PivotValueSchema = z.object({
  sourceColumnOffset: z.coerce
    .number()
    .describe("Column offset for values (0-based from source range)"),
  summarizeFunction: z
    .enum([
      "SUM",
      "COUNTA",
      "COUNT",
      "COUNTUNIQUE",
      "AVERAGE",
      "MAX",
      "MIN",
      "MEDIAN",
      "PRODUCT",
      "STDEV",
      "STDEVP",
      "VAR",
      "VARP",
    ])
    .describe("Aggregation function"),
  name: z.string().optional().describe("Display name for the value"),
});

export const createPivotTableTool = (env: Env) =>
  createPrivateTool({
    id: "create_pivot_table",
    description:
      "Create a pivot table to summarize and analyze data. Pivot tables can group, aggregate, and cross-tabulate data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sourceSheetId: z.coerce
        .number()
        .describe("Sheet ID containing the source data"),
      sourceStartRow: z.coerce
        .number()
        .describe("Start row of source data (0-based)"),
      sourceEndRow: z.coerce
        .number()
        .describe("End row of source data (exclusive)"),
      sourceStartColumn: z.coerce
        .number()
        .describe("Start column of source data (0-based)"),
      sourceEndColumn: z.coerce
        .number()
        .describe("End column of source data (exclusive)"),
      destinationSheetId: z.coerce
        .number()
        .describe("Sheet ID where pivot table will be placed"),
      destinationRow: z.coerce
        .number()
        .describe("Row where pivot table will start (0-based)"),
      destinationColumn: z.coerce
        .number()
        .describe("Column where pivot table will start (0-based)"),
      rows: z
        .array(PivotGroupSchema)
        .optional()
        .describe("Row groupings - columns from source to use as row headers"),
      columns: z
        .array(PivotGroupSchema)
        .optional()
        .describe(
          "Column groupings - columns from source to use as column headers",
        ),
      values: z
        .array(PivotValueSchema)
        .optional()
        .describe("Values to aggregate (e.g., SUM of Sales)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.createPivotTable(
        context.spreadsheetId,
        context.sourceSheetId,
        {
          startRow: context.sourceStartRow,
          endRow: context.sourceEndRow,
          startCol: context.sourceStartColumn,
          endCol: context.sourceEndColumn,
        },
        context.destinationSheetId,
        context.destinationRow,
        context.destinationColumn,
        {
          rows: context.rows,
          columns: context.columns,
          values: context.values,
        },
      );
      return { success: true, message: "Pivot table created successfully" };
    },
  });

export const analysisTools = [
  createAddNamedRangeTool,
  createDeleteNamedRangeTool,
  createPivotTableTool,
];
