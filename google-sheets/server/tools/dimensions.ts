/**
 * Dimension Operations Tools (Insert/Delete/Move/Hide/Resize Rows and Columns)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";

// Insert Rows
export const createInsertRowsTool = (env: Env) =>
  createPrivateTool({
    id: "insert_rows",
    description: "Insert empty rows at a specific position in a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start row index (0-based, where to insert)"),
      count: z.coerce.number().describe("Number of rows to insert"),
      inheritFromBefore: z
        .boolean()
        .optional()
        .describe("Inherit formatting from row above (default: false)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.insertDimension(
        context.spreadsheetId,
        context.sheetId,
        "ROWS",
        context.startIndex,
        context.startIndex + context.count,
        context.inheritFromBefore ?? false,
      );
      return {
        success: true,
        message: `${context.count} row(s) inserted at index ${context.startIndex}`,
      };
    },
  });

// Insert Columns
export const createInsertColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "insert_columns",
    description: "Insert empty columns at a specific position in a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index (0-based, A=0, B=1, etc.)"),
      count: z.coerce.number().describe("Number of columns to insert"),
      inheritFromBefore: z
        .boolean()
        .optional()
        .describe(
          "Inherit formatting from column to the left (default: false)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.insertDimension(
        context.spreadsheetId,
        context.sheetId,
        "COLUMNS",
        context.startIndex,
        context.startIndex + context.count,
        context.inheritFromBefore ?? false,
      );
      return {
        success: true,
        message: `${context.count} column(s) inserted at index ${context.startIndex}`,
      };
    },
  });

// Delete Rows
export const createDeleteRowsTool = (env: Env) =>
  createPrivateTool({
    id: "delete_rows",
    description: "Delete rows from a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce.number().describe("Start row index (0-based)"),
      count: z.coerce.number().describe("Number of rows to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteDimension(
        context.spreadsheetId,
        context.sheetId,
        "ROWS",
        context.startIndex,
        context.startIndex + context.count,
      );
      return {
        success: true,
        message: `${context.count} row(s) deleted starting at index ${context.startIndex}`,
      };
    },
  });

// Delete Columns
export const createDeleteColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "delete_columns",
    description: "Delete columns from a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index (0-based, A=0)"),
      count: z.coerce.number().describe("Number of columns to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteDimension(
        context.spreadsheetId,
        context.sheetId,
        "COLUMNS",
        context.startIndex,
        context.startIndex + context.count,
      );
      return {
        success: true,
        message: `${context.count} column(s) deleted starting at index ${context.startIndex}`,
      };
    },
  });

// Move Rows
export const createMoveRowsTool = (env: Env) =>
  createPrivateTool({
    id: "move_rows",
    description: "Move rows to a different position in the sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start row index of rows to move (0-based)"),
      count: z.coerce.number().describe("Number of rows to move"),
      destinationIndex: z.coerce
        .number()
        .describe("Destination row index (0-based)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.moveDimension(
        context.spreadsheetId,
        context.sheetId,
        "ROWS",
        context.startIndex,
        context.startIndex + context.count,
        context.destinationIndex,
      );
      return {
        success: true,
        message: `${context.count} row(s) moved to index ${context.destinationIndex}`,
      };
    },
  });

// Move Columns
export const createMoveColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "move_columns",
    description: "Move columns to a different position in the sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index of columns to move (0-based)"),
      count: z.coerce.number().describe("Number of columns to move"),
      destinationIndex: z.coerce
        .number()
        .describe("Destination column index (0-based)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.moveDimension(
        context.spreadsheetId,
        context.sheetId,
        "COLUMNS",
        context.startIndex,
        context.startIndex + context.count,
        context.destinationIndex,
      );
      return {
        success: true,
        message: `${context.count} column(s) moved to index ${context.destinationIndex}`,
      };
    },
  });

// Hide Rows
export const createHideRowsTool = (env: Env) =>
  createPrivateTool({
    id: "hide_rows",
    description: "Hide rows in a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce.number().describe("Start row index (0-based)"),
      count: z.coerce.number().describe("Number of rows to hide"),
      hidden: z
        .boolean()
        .optional()
        .describe("True to hide, false to show (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const hidden = context.hidden ?? true;
      await client.updateDimensionProperties(
        context.spreadsheetId,
        context.sheetId,
        "ROWS",
        context.startIndex,
        context.startIndex + context.count,
        { hiddenByUser: hidden },
      );
      return {
        success: true,
        message: `${context.count} row(s) ${hidden ? "hidden" : "shown"}`,
      };
    },
  });

// Hide Columns
export const createHideColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "hide_columns",
    description: "Hide columns in a sheet.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index (0-based, A=0)"),
      count: z.coerce.number().describe("Number of columns to hide"),
      hidden: z
        .boolean()
        .optional()
        .describe("True to hide, false to show (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const hidden = context.hidden ?? true;
      await client.updateDimensionProperties(
        context.spreadsheetId,
        context.sheetId,
        "COLUMNS",
        context.startIndex,
        context.startIndex + context.count,
        { hiddenByUser: hidden },
      );
      return {
        success: true,
        message: `${context.count} column(s) ${hidden ? "hidden" : "shown"}`,
      };
    },
  });

// Resize Rows
export const createResizeRowsTool = (env: Env) =>
  createPrivateTool({
    id: "resize_rows",
    description: "Set the height of rows in pixels.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce.number().describe("Start row index (0-based)"),
      count: z.coerce.number().describe("Number of rows to resize"),
      pixelSize: z.coerce.number().describe("Height in pixels"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.updateDimensionProperties(
        context.spreadsheetId,
        context.sheetId,
        "ROWS",
        context.startIndex,
        context.startIndex + context.count,
        { pixelSize: context.pixelSize },
      );
      return {
        success: true,
        message: `${context.count} row(s) resized to ${context.pixelSize}px`,
      };
    },
  });

// Resize Columns
export const createResizeColumnsTool = (env: Env) =>
  createPrivateTool({
    id: "resize_columns",
    description: "Set the width of columns in pixels.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startIndex: z.coerce
        .number()
        .describe("Start column index (0-based, A=0)"),
      count: z.coerce.number().describe("Number of columns to resize"),
      pixelSize: z.coerce.number().describe("Width in pixels"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.updateDimensionProperties(
        context.spreadsheetId,
        context.sheetId,
        "COLUMNS",
        context.startIndex,
        context.startIndex + context.count,
        { pixelSize: context.pixelSize },
      );
      return {
        success: true,
        message: `${context.count} column(s) resized to ${context.pixelSize}px`,
      };
    },
  });

export const dimensionTools = [
  createInsertRowsTool,
  createInsertColumnsTool,
  createDeleteRowsTool,
  createDeleteColumnsTool,
  createMoveRowsTool,
  createMoveColumnsTool,
  createHideRowsTool,
  createHideColumnsTool,
  createResizeRowsTool,
  createResizeColumnsTool,
];
