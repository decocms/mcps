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

// ============================================
// Merge Cells
// ============================================

export const createMergeCellsTool = (env: Env) =>
  createPrivateTool({
    id: "merge_cells",
    description:
      "Merge multiple cells into one. Useful for creating titles or headers spanning multiple columns.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      mergeType: z
        .enum(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"])
        .optional()
        .describe(
          "MERGE_ALL: merge all cells, MERGE_COLUMNS: merge cells in each column, MERGE_ROWS: merge cells in each row (default: MERGE_ALL)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.mergeCells(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        context.mergeType ?? "MERGE_ALL",
      );
      return { success: true, message: "Cells merged successfully" };
    },
  });

export const createUnmergeCellsTool = (env: Env) =>
  createPrivateTool({
    id: "unmerge_cells",
    description: "Unmerge previously merged cells.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
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
      await client.unmergeCells(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
      );
      return { success: true, message: "Cells unmerged successfully" };
    },
  });

// ============================================
// Borders
// ============================================

const BorderStyleSchema = z.enum([
  "NONE",
  "DOTTED",
  "DASHED",
  "SOLID",
  "SOLID_MEDIUM",
  "SOLID_THICK",
  "DOUBLE",
]);
const ColorSchema = z.object({
  red: z.number().min(0).max(1),
  green: z.number().min(0).max(1),
  blue: z.number().min(0).max(1),
});
const BorderSchema = z.object({
  style: BorderStyleSchema,
  color: ColorSchema.optional(),
});

export const createSetBordersTool = (env: Env) =>
  createPrivateTool({
    id: "set_borders",
    description: "Add or update borders around and within a range of cells.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      top: BorderSchema.optional().describe("Top border style"),
      bottom: BorderSchema.optional().describe("Bottom border style"),
      left: BorderSchema.optional().describe("Left border style"),
      right: BorderSchema.optional().describe("Right border style"),
      innerHorizontal: BorderSchema.optional().describe(
        "Inner horizontal borders (between rows)",
      ),
      innerVertical: BorderSchema.optional().describe(
        "Inner vertical borders (between columns)",
      ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.updateBorders(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          top: context.top,
          bottom: context.bottom,
          left: context.left,
          right: context.right,
          innerHorizontal: context.innerHorizontal,
          innerVertical: context.innerVertical,
        },
      );
      return { success: true, message: "Borders applied successfully" };
    },
  });

// ============================================
// Banding (Alternating Row Colors)
// ============================================

export const createAddBandingTool = (env: Env) =>
  createPrivateTool({
    id: "add_banding",
    description:
      "Add alternating row colors (banding) to a range. Great for making tables easier to read.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      headerColor: ColorSchema.optional().describe("Color for header row"),
      firstBandColor: ColorSchema.optional().describe("Color for odd rows"),
      secondBandColor: ColorSchema.optional().describe("Color for even rows"),
      footerColor: ColorSchema.optional().describe("Color for footer row"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addBanding(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          headerColor: context.headerColor,
          firstBandColor: context.firstBandColor,
          secondBandColor: context.secondBandColor,
          footerColor: context.footerColor,
        },
      );
      return {
        success: true,
        message: "Banding (alternating colors) applied successfully",
      };
    },
  });

// ============================================
// Number Format
// ============================================

export const createSetNumberFormatTool = (env: Env) =>
  createPrivateTool({
    id: "set_number_format",
    description:
      "Set the number format for a range of cells (currency, percentage, date, etc.).",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      formatType: z
        .enum([
          "TEXT",
          "NUMBER",
          "PERCENT",
          "CURRENCY",
          "DATE",
          "TIME",
          "DATE_TIME",
          "SCIENTIFIC",
        ])
        .describe("Type of number format"),
      pattern: z
        .string()
        .optional()
        .describe(
          "Custom pattern (e.g., '#,##0.00' for numbers, 'R$ #,##0.00' for currency, 'yyyy-mm-dd' for dates)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.setNumberFormat(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          type: context.formatType,
          pattern: context.pattern,
        },
      );
      return {
        success: true,
        message: `Number format (${context.formatType}) applied successfully`,
      };
    },
  });

// ============================================
// Notes
// ============================================

export const createAddNoteTool = (env: Env) =>
  createPrivateTool({
    id: "add_note",
    description:
      "Add a note (comment) to a cell. Notes appear when hovering over the cell.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      row: z.coerce.number().describe("Row index (0-based)"),
      column: z.coerce.number().describe("Column index (0-based)"),
      note: z.string().describe("Note text to add"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addNote(
        context.spreadsheetId,
        context.sheetId,
        context.row,
        context.column,
        context.note,
      );
      return { success: true, message: "Note added successfully" };
    },
  });

export const formattingTools = [
  createFormatCellsTool,
  createAutoResizeColumnsTool,
  createSortRangeTool,
  createFindReplaceTool,
  createMergeCellsTool,
  createUnmergeCellsTool,
  createSetBordersTool,
  createAddBandingTool,
  createSetNumberFormatTool,
  createAddNoteTool,
];
