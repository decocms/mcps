/**
 * Spreadsheet and Sheet Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

const SheetSchema = z.object({
  sheetId: z.number(),
  title: z.string(),
  index: z.number(),
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

export const spreadsheetTools = [
  createCreateSpreadsheetTool,
  createGetSpreadsheetTool,
  createAddSheetTool,
  createDeleteSheetTool,
  createRenameSheetTool,
];
