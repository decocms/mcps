/**
 * Filter Operations Tools (Basic Filters, Filter Views, Slicers)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

const ColorSchema = z.object({
  red: z.number().min(0).max(1),
  green: z.number().min(0).max(1),
  blue: z.number().min(0).max(1),
});

// ============================================
// Basic Filter Tools
// ============================================

export const createSetBasicFilterTool = (env: Env) =>
  createPrivateTool({
    id: "set_basic_filter",
    description:
      "Create or update a basic filter on a range. Basic filters add dropdown arrows to column headers for filtering data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce
        .number()
        .describe("Start row index (0-based, usually 0 for header row)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      criteria: z
        .record(
          z.coerce.number(),
          z.object({
            hiddenValues: z
              .array(z.string())
              .optional()
              .describe("Values to hide from view"),
          }),
        )
        .optional()
        .describe(
          "Filter criteria by column index (0-based). Keys are column indices, values specify what to hide.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.setBasicFilter(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        context.criteria,
      );
      return { success: true, message: "Basic filter applied successfully" };
    },
  });

export const createClearBasicFilterTool = (env: Env) =>
  createPrivateTool({
    id: "clear_basic_filter",
    description: "Remove the basic filter from a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.clearBasicFilter(context.spreadsheetId, context.sheetId);
      return { success: true, message: "Basic filter cleared" };
    },
  });

// ============================================
// Filter View Tools
// ============================================

export const createAddFilterViewTool = (env: Env) =>
  createPrivateTool({
    id: "create_filter_view",
    description:
      "Create a named filter view. Filter views are saved filter configurations that can be accessed from the Data menu.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      title: z.string().describe("Name for the filter view"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      criteria: z
        .record(
          z.coerce.number(),
          z.object({
            hiddenValues: z
              .array(z.string())
              .optional()
              .describe("Values to hide from view"),
          }),
        )
        .optional()
        .describe("Filter criteria by column index"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addFilterView(
        context.spreadsheetId,
        context.sheetId,
        context.title,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        context.criteria,
      );
      return {
        success: true,
        message: `Filter view "${context.title}" created successfully`,
      };
    },
  });

export const createDeleteFilterViewTool = (env: Env) =>
  createPrivateTool({
    id: "delete_filter_view",
    description: "Delete a filter view by its ID.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      filterId: z.coerce.number().describe("Filter view ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteFilterView(context.spreadsheetId, context.filterId);
      return {
        success: true,
        message: `Filter view ${context.filterId} deleted`,
      };
    },
  });

// ============================================
// Slicer Tools
// ============================================

export const createAddSlicerTool = (env: Env) =>
  createPrivateTool({
    id: "add_slicer",
    description:
      "Add a slicer (visual filter control) to the sheet. Slicers provide a visual way to filter data in tables and pivot tables.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      dataStartRow: z.coerce
        .number()
        .describe("Start row of data range to filter (0-based)"),
      dataEndRow: z.coerce
        .number()
        .describe("End row of data range (exclusive)"),
      dataStartColumn: z.coerce
        .number()
        .describe("Start column of data range (0-based)"),
      dataEndColumn: z.coerce
        .number()
        .describe("End column of data range (exclusive)"),
      positionRow: z.coerce
        .number()
        .describe("Row where slicer will be placed"),
      positionColumn: z.coerce
        .number()
        .describe("Column where slicer will be placed"),
      title: z.string().optional().describe("Slicer title"),
      columnIndex: z.coerce
        .number()
        .optional()
        .describe(
          "Column index within data range to filter by (0-based relative to data range)",
        ),
      width: z.coerce
        .number()
        .optional()
        .describe("Slicer width in pixels (default: 200)"),
      height: z.coerce
        .number()
        .optional()
        .describe("Slicer height in pixels (default: 200)"),
      backgroundColor: ColorSchema.optional().describe(
        "Background color for slicer",
      ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addSlicer(
        context.spreadsheetId,
        context.sheetId,
        {
          startRow: context.dataStartRow,
          endRow: context.dataEndRow,
          startCol: context.dataStartColumn,
          endCol: context.dataEndColumn,
        },
        {
          row: context.positionRow,
          col: context.positionColumn,
          width: context.width,
          height: context.height,
        },
        {
          title: context.title,
          columnIndex: context.columnIndex,
          backgroundColor: context.backgroundColor,
        },
      );
      return { success: true, message: "Slicer added successfully" };
    },
  });

export const filterTools = [
  createSetBasicFilterTool,
  createClearBasicFilterTool,
  createAddFilterViewTool,
  createDeleteFilterViewTool,
  createAddSlicerTool,
];
