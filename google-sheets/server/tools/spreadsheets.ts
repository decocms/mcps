/**
 * Spreadsheet and Sheet Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

const SheetSchema = z.object({
  sheetId: z.number().optional(),
  title: z.string().optional(),
  index: z.number().optional(),
  rowCount: z.number().optional(),
  columnCount: z.number().optional(),
});

const SpreadsheetSchema = z.object({
  spreadsheetId: z.string(),
  title: z.string(),
  spreadsheetUrl: z.string().optional(),
  sheets: z.array(SheetSchema).optional(),
});

export const createCreateSpreadsheetTool = (env: Env) =>
  createPrivateTool({
    id: "create_spreadsheet",
    description: "Create a new Google Spreadsheet.",
    inputSchema: z.object({
      title: z.string().describe("Title of the new spreadsheet"),
    }),
    outputSchema: z.object({
      spreadsheet: SpreadsheetSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.createSpreadsheet(context.title);
      return {
        spreadsheet: {
          spreadsheetId: result.spreadsheetId,
          title: result.properties.title,
          spreadsheetUrl: result.spreadsheetUrl,
          sheets: result.sheets?.map((s) => ({
            sheetId: s.properties.sheetId,
            title: s.properties.title,
            index: s.properties.index,
            rowCount: s.properties.gridProperties?.rowCount,
            columnCount: s.properties.gridProperties?.columnCount,
          })),
        },
        success: true,
      };
    },
  });

export const createGetSpreadsheetTool = (env: Env) =>
  createPrivateTool({
    id: "get_spreadsheet",
    description: "Get metadata about a spreadsheet including all sheet names.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
    }),
    outputSchema: z.object({
      spreadsheet: SpreadsheetSchema,
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.getSpreadsheet(context.spreadsheetId);
      return {
        spreadsheet: {
          spreadsheetId: result.spreadsheetId,
          title: result.properties.title,
          spreadsheetUrl: result.spreadsheetUrl,
          sheets: result.sheets?.map((s) => ({
            sheetId: s.properties.sheetId,
            title: s.properties.title,
            index: s.properties.index,
            rowCount: s.properties.gridProperties?.rowCount,
            columnCount: s.properties.gridProperties?.columnCount,
          })),
        },
      };
    },
  });

export const createAddSheetTool = (env: Env) =>
  createPrivateTool({
    id: "add_sheet",
    description: "Add a new sheet/tab to an existing spreadsheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      title: z.string().describe("Title of the new sheet"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addSheet(context.spreadsheetId, context.title);
      return {
        success: true,
        message: `Sheet "${context.title}" added successfully`,
      };
    },
  });

export const createDeleteSheetTool = (env: Env) =>
  createPrivateTool({
    id: "delete_sheet",
    description: "Delete a sheet/tab from a spreadsheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce
        .number()
        .describe("Sheet ID (numeric ID, not the title)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteSheet(context.spreadsheetId, context.sheetId);
      return {
        success: true,
        message: `Sheet ${context.sheetId} deleted successfully`,
      };
    },
  });

export const createRenameSheetTool = (env: Env) =>
  createPrivateTool({
    id: "rename_sheet",
    description: "Rename a sheet/tab in a spreadsheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric ID)"),
      newTitle: z.string().describe("New title for the sheet"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.renameSheet(
        context.spreadsheetId,
        context.sheetId,
        context.newTitle,
      );
      return {
        success: true,
        message: `Sheet renamed to "${context.newTitle}"`,
      };
    },
  });

// ============================================
// Duplicate Sheet
// ============================================

export const createDuplicateSheetTool = (env: Env) =>
  createPrivateTool({
    id: "duplicate_sheet",
    description:
      "Create a copy of an existing sheet within the same spreadsheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sourceSheetId: z.coerce.number().describe("Sheet ID to duplicate"),
      newSheetName: z
        .string()
        .optional()
        .describe(
          "Name for the new sheet (optional, auto-generated if not provided)",
        ),
      insertSheetIndex: z.coerce
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Position index for the new sheet (0-based, optional)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.duplicateSheet(
        context.spreadsheetId,
        context.sourceSheetId,
        context.newSheetName,
        context.insertSheetIndex,
      );
      return {
        success: true,
        message: context.newSheetName
          ? `Sheet duplicated as "${context.newSheetName}"`
          : "Sheet duplicated successfully",
      };
    },
  });

// ============================================
// Freeze Rows/Columns
// ============================================

export const createFreezeRowsTool = (env: Env) =>
  createPrivateTool({
    id: "freeze_rows",
    description:
      "Freeze rows at the top of a sheet. Frozen rows stay visible when scrolling down. Useful for keeping headers visible.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      frozenRowCount: z.coerce
        .number()
        .int()
        .min(0)
        .describe("Number of rows to freeze (0 to unfreeze)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.freezeRows(
        context.spreadsheetId,
        context.sheetId,
        context.frozenRowCount,
      );
      return {
        success: true,
        message:
          context.frozenRowCount > 0
            ? `${context.frozenRowCount} row(s) frozen`
            : "Rows unfrozen",
      };
    },
  });

export const createFreezeColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "freeze_columns",
    description:
      "Freeze columns at the left of a sheet. Frozen columns stay visible when scrolling right. Useful for keeping row labels visible.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      frozenColumnCount: z.coerce
        .number()
        .int()
        .min(0)
        .describe("Number of columns to freeze (0 to unfreeze)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.freezeColumns(
        context.spreadsheetId,
        context.sheetId,
        context.frozenColumnCount,
      );
      return {
        success: true,
        message:
          context.frozenColumnCount > 0
            ? `${context.frozenColumnCount} column(s) frozen`
            : "Columns unfrozen",
      };
    },
  });

// ============================================
// Get Spreadsheet Metadata (Enhanced)
// ============================================

export const createGetSpreadsheetMetadataTool = (env: Env) =>
  createPrivateTool({
    id: "get_spreadsheet_metadata",
    description:
      "Get enhanced metadata about a spreadsheet including actual data ranges and filled cell counts for each sheet. More detailed than get_spreadsheet - shows where data actually exists.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
    }),
    outputSchema: z.object({
      spreadsheetId: z.string(),
      title: z.string(),
      url: z.string().optional(),
      locale: z.string().optional(),
      sheets: z.array(
        z.object({
          id: z.number(),
          title: z.string(),
          rowCount: z.number(),
          columnCount: z.number(),
          dataRange: z.string().optional(),
          filledCells: z.number().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const { spreadsheet, dataRanges } =
        await client.getSpreadsheetWithDataRanges(context.spreadsheetId);

      return {
        spreadsheetId: spreadsheet.spreadsheetId,
        title: spreadsheet.properties?.title || "",
        url: spreadsheet.spreadsheetUrl,
        locale: spreadsheet.properties?.locale,
        sheets:
          spreadsheet.sheets?.map((s) => {
            const title = s.properties?.title || "";
            const rangeInfo = dataRanges[title];
            return {
              id: s.properties?.sheetId || 0,
              title,
              rowCount: s.properties?.gridProperties?.rowCount || 0,
              columnCount: s.properties?.gridProperties?.columnCount || 0,
              dataRange: rangeInfo?.range,
              filledCells: rangeInfo?.filledCells,
            };
          }) || [],
      };
    },
  });

// ============================================
// Copy Sheet (to same or different spreadsheet)
// ============================================

export const createCopySheetTool = (env: Env) =>
  createPrivateTool({
    id: "copy_sheet",
    description:
      "Copy a sheet to the same spreadsheet or to a different spreadsheet. Uses the native copyTo API endpoint.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Source spreadsheet ID"),
      sheetId: z.coerce
        .number()
        .describe("Sheet ID to copy (numeric ID, not the title)"),
      destinationSpreadsheetId: z
        .string()
        .optional()
        .describe(
          "Destination spreadsheet ID. If not provided, copies within the same spreadsheet.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      newSheetId: z.number(),
      newSheetTitle: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.copySheetTo(
        context.spreadsheetId,
        context.sheetId,
        context.destinationSpreadsheetId,
      );
      return {
        success: true,
        newSheetId: result.sheetId,
        newSheetTitle: result.title,
        message: context.destinationSpreadsheetId
          ? `Sheet copied to spreadsheet ${context.destinationSpreadsheetId} as "${result.title}"`
          : `Sheet copied as "${result.title}"`,
      };
    },
  });

export const spreadsheetTools = [
  createCreateSpreadsheetTool,
  createGetSpreadsheetTool,
  createGetSpreadsheetMetadataTool,
  createAddSheetTool,
  createDeleteSheetTool,
  createRenameSheetTool,
  createDuplicateSheetTool,
  createCopySheetTool,
  createFreezeRowsTool,
  createFreezeColumnsTool,
];
