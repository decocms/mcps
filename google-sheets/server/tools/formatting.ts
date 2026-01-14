/**
 * Formatting and Data Operations Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

export const createFormatCellsTool = (env: Env) =>
  createPrivateTool({
    id: "format_cells",
    description:
      "Apply formatting to a range of cells (bold, italic, colors, font size).",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce
        .number()
        .describe("Start column index (0-based, A=0)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      bold: z.boolean().optional().describe("Make text bold"),
      italic: z.boolean().optional().describe("Make text italic"),
      fontSize: z.coerce.number().optional().describe("Font size in points"),
      backgroundColor: z
        .object({
          red: z.number().min(0).max(1),
          green: z.number().min(0).max(1),
          blue: z.number().min(0).max(1),
        })
        .optional()
        .describe("Background color (RGB values 0-1)"),
      textColor: z
        .object({
          red: z.number().min(0).max(1),
          green: z.number().min(0).max(1),
          blue: z.number().min(0).max(1),
        })
        .optional()
        .describe("Text color (RGB values 0-1)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.formatCells(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          bold: context.bold,
          italic: context.italic,
          fontSize: context.fontSize,
          backgroundColor: context.backgroundColor,
          textColor: context.textColor,
        },
      );
      return { success: true, message: "Formatting applied successfully" };
    },
  });

export const createAutoResizeColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "auto_resize_columns",
    description: "Auto-resize columns to fit their content.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index (0-based, A=0)"),
      endIndex: z.coerce.number().describe("End column index (exclusive)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.autoResizeColumns(
        context.spreadsheetId,
        context.sheetId,
        context.startIndex,
        context.endIndex,
      );
      return { success: true, message: "Columns resized successfully" };
    },
  });

export const createSortRangeTool = (env: Env) =>
  createPrivateTool({
    id: "sort_range",
    description: "Sort a range of data by a specific column.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      sortColumn: z.coerce
        .number()
        .describe("Column index to sort by (0-based)"),
      ascending: z
        .boolean()
        .optional()
        .describe("Sort ascending (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.sortRange(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        context.sortColumn,
        context.ascending ?? true,
      );
      return { success: true, message: "Range sorted successfully" };
    },
  });

export const createFindReplaceTool = (env: Env) =>
  createPrivateTool({
    id: "find_replace",
    description:
      "Find and replace text across a spreadsheet or specific sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      find: z.string().describe("Text to find"),
      replacement: z.string().describe("Text to replace with"),
      matchCase: z.boolean().optional().describe("Case-sensitive search"),
      matchEntireCell: z
        .boolean()
        .optional()
        .describe("Match entire cell content only"),
      sheetId: z.coerce
        .number()
        .optional()
        .describe("Specific sheet ID (if not provided, searches all sheets)"),
    }),
    outputSchema: z.object({
      occurrencesChanged: z.number(),
      rowsChanged: z.number(),
      sheetsChanged: z.number(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.findReplace(
        context.spreadsheetId,
        context.find,
        context.replacement,
        {
          matchCase: context.matchCase,
          matchEntireCell: context.matchEntireCell,
          allSheets: context.sheetId === undefined,
          sheetId: context.sheetId,
        },
      );
      const reply = result.replies?.[0]?.findReplace || {};
      return {
        occurrencesChanged: reply.occurrencesChanged || 0,
        rowsChanged: reply.rowsChanged || 0,
        sheetsChanged: reply.sheetsChanged || 0,
        success: true,
      };
    },
  });

export const formattingTools = [
  createFormatCellsTool,
  createAutoResizeColumnsTool,
  createSortRangeTool,
  createFindReplaceTool,
];
