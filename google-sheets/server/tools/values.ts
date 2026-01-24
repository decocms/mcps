/**
 * Value/Data Operations Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SheetsClient, getAccessToken } from "../lib/sheets-client.ts";
import { processHeaders } from "../lib/utils.ts";

export const createReadRangeTool = (env: Env) =>
  createPrivateTool({
    id: "read_range",
    description:
      "Read values from a range in a spreadsheet. Use A1 notation (e.g., 'Sheet1!A1:D10' or 'A1:D10').",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z
        .string()
        .describe(
          "Range in A1 notation (e.g., 'Sheet1!A1:D10', 'A:D', '1:10')",
        ),
    }),
    outputSchema: z.object({
      range: z.string(),
      values: z.array(z.array(z.any())),
      rowCount: z.number(),
      columnCount: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.readRange(
        context.spreadsheetId,
        context.range,
      );
      const values = result.values || [];
      return {
        range: result.range,
        values,
        rowCount: values.length,
        columnCount:
          values.length > 0
            ? Math.max(...values.map((r: any[]) => r.length))
            : 0,
      };
    },
  });

export const createWriteRangeTool = (env: Env) =>
  createPrivateTool({
    id: "write_range",
    description:
      "Write values to a range in a spreadsheet. Overwrites existing data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z.string().describe("Range in A1 notation (e.g., 'Sheet1!A1')"),
      values: z
        .array(z.array(z.any()))
        .describe("2D array of values to write (rows x columns)"),
      raw: z
        .boolean()
        .optional()
        .describe(
          "If true, values are stored as-is. If false (default), values are parsed (formulas work).",
        ),
    }),
    outputSchema: z.object({
      updatedRange: z.string(),
      updatedRows: z.number(),
      updatedColumns: z.number(),
      updatedCells: z.number(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.writeRange(
        context.spreadsheetId,
        context.range,
        context.values,
        context.raw ? "RAW" : "USER_ENTERED",
      );
      return {
        updatedRange: result.updatedRange,
        updatedRows: result.updatedRows,
        updatedColumns: result.updatedColumns,
        updatedCells: result.updatedCells,
        success: true,
      };
    },
  });

export const createAppendRowsTool = (env: Env) =>
  createPrivateTool({
    id: "append_rows",
    description:
      "Append rows to the end of a table/range in a spreadsheet. Automatically finds the last row.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z
        .string()
        .describe("Range to append to (e.g., 'Sheet1!A:D' or 'Sheet1')"),
      values: z.array(z.array(z.any())).describe("2D array of rows to append"),
      raw: z.boolean().optional().describe("If true, values are stored as-is"),
    }),
    outputSchema: z.object({
      tableRange: z.string(),
      updatedRange: z.string(),
      updatedRows: z.number(),
      updatedCells: z.number(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.appendRows(
        context.spreadsheetId,
        context.range,
        context.values,
        context.raw ? "RAW" : "USER_ENTERED",
      );
      return {
        tableRange: result.tableRange,
        updatedRange: result.updates.updatedRange,
        updatedRows: result.updates.updatedRows,
        updatedCells: result.updates.updatedCells,
        success: true,
      };
    },
  });

export const createClearRangeTool = (env: Env) =>
  createPrivateTool({
    id: "clear_range",
    description: "Clear all values from a range (keeps formatting).",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z.string().describe("Range to clear (e.g., 'Sheet1!A1:D10')"),
    }),
    outputSchema: z.object({
      clearedRange: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.clearRange(
        context.spreadsheetId,
        context.range,
      );
      return { clearedRange: result.clearedRange, success: true };
    },
  });

export const createBatchReadTool = (env: Env) =>
  createPrivateTool({
    id: "batch_read",
    description: "Read multiple ranges from a spreadsheet in a single request.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      ranges: z
        .array(z.string())
        .describe(
          "Array of ranges to read (e.g., ['Sheet1!A1:B10', 'Sheet2!A1:C5'])",
        ),
    }),
    outputSchema: z.object({
      valueRanges: z.array(
        z.object({
          range: z.string(),
          values: z.array(z.array(z.any())),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.batchGetValues(
        context.spreadsheetId,
        context.ranges,
      );
      return {
        valueRanges:
          result.valueRanges?.map((vr: any) => ({
            range: vr.range,
            values: vr.values || [],
          })) || [],
      };
    },
  });

export const createBatchWriteTool = (env: Env) =>
  createPrivateTool({
    id: "batch_write",
    description:
      "Write to multiple ranges in a spreadsheet in a single request.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      data: z
        .array(
          z.object({
            range: z.string().describe("Range in A1 notation"),
            values: z.array(z.array(z.any())).describe("Values to write"),
          }),
        )
        .describe("Array of range-value pairs to write"),
      raw: z.boolean().optional().describe("If true, values are stored as-is"),
    }),
    outputSchema: z.object({
      totalUpdatedRows: z.number(),
      totalUpdatedColumns: z.number(),
      totalUpdatedCells: z.number(),
      totalUpdatedSheets: z.number(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.batchUpdateValues(
        context.spreadsheetId,
        context.data,
        context.raw ? "RAW" : "USER_ENTERED",
      );
      return {
        totalUpdatedRows: result.totalUpdatedRows,
        totalUpdatedColumns: result.totalUpdatedColumns,
        totalUpdatedCells: result.totalUpdatedCells,
        totalUpdatedSheets: result.totalUpdatedSheets,
        success: true,
      };
    },
  });

// ============================================
// Read Formulas
// ============================================

export const createReadFormulasTool = (env: Env) =>
  createPrivateTool({
    id: "read_formulas",
    description:
      "Read formulas from a range in a spreadsheet. Unlike read_range which returns calculated values, this returns the actual formulas (e.g., '=SUM(A1:A10)' instead of '100').",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z
        .string()
        .describe(
          "Range in A1 notation (e.g., 'Sheet1!A1:D10', 'A:D', '1:10')",
        ),
    }),
    outputSchema: z.object({
      range: z.string(),
      formulas: z
        .array(z.array(z.any()))
        .describe(
          "2D array of formulas (cells without formulas return their value)",
        ),
      rowCount: z.number(),
      columnCount: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.readFormulas(
        context.spreadsheetId,
        context.range,
      );
      const formulas = result.values || [];
      return {
        range: result.range,
        formulas,
        rowCount: formulas.length,
        columnCount:
          formulas.length > 0
            ? Math.max(...formulas.map((r: any[]) => r.length))
            : 0,
      };
    },
  });

// ============================================
// Get Sheet Headers
// ============================================

export const createGetSheetHeadersTool = (env: Env) =>
  createPrivateTool({
    id: "get_sheet_headers",
    description:
      "Get structured header information from a sheet. Returns column labels, header-to-index mapping, and header values array. Useful for understanding column structure before querying data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetName: z.string().describe("Name of the sheet"),
      range: z
        .string()
        .optional()
        .describe("Column range to read headers from (default: A:Z)"),
      headerRow: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Row number containing headers (default: 1)"),
    }),
    outputSchema: z.object({
      labels: z
        .record(z.string(), z.string())
        .describe("Mapping of Col1, Col2... to header names"),
      headerMap: z
        .record(z.string(), z.number())
        .describe("Mapping of header name to column index (0-based)"),
      headerValues: z.array(z.string()).describe("Array of header values"),
      columnCount: z.number().describe("Number of columns with headers"),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.getSheetHeaders(
        context.spreadsheetId,
        context.sheetName,
        context.range || "A:Z",
        context.headerRow || 1,
      );

      const headerRow = result.values?.[0] || [];
      const { labels, headerMap, headerValues } = processHeaders(headerRow);

      return {
        labels,
        headerMap,
        headerValues,
        columnCount: headerValues.length,
      };
    },
  });

// ============================================
// Search Data
// ============================================

export const createSearchDataTool = (env: Env) =>
  createPrivateTool({
    id: "search_data",
    description:
      "Search for a term across columns in a sheet. Returns matching rows with row numbers. Useful for finding specific data without knowing the exact location.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetName: z.string().describe("Name of the sheet to search"),
      searchTerm: z.string().describe("Term to search for"),
      searchColumns: z
        .array(z.coerce.number())
        .optional()
        .describe(
          "Column indices to search in (0-based). If not provided, searches all columns.",
        ),
      headerRow: z.coerce
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Row number containing headers (default: 1). Set to 0 to treat first row as data.",
        ),
      caseSensitive: z
        .boolean()
        .optional()
        .describe("Whether search is case-sensitive (default: false)"),
    }),
    outputSchema: z.object({
      headers: z.array(z.string()).describe("Column headers from the sheet"),
      matches: z
        .array(
          z.object({
            rowNumber: z.number().describe("1-based row number in the sheet"),
            values: z.array(z.any()).describe("Cell values for the row"),
          }),
        )
        .describe("Matching rows"),
      totalMatches: z.number().describe("Total number of matches found"),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      const result = await client.searchInSheet(
        context.spreadsheetId,
        context.sheetName,
        context.searchTerm,
        {
          searchColumns: context.searchColumns,
          headerRow: context.headerRow ?? 1,
          caseSensitive: context.caseSensitive ?? false,
        },
      );

      return {
        headers: result.headers,
        matches: result.matches,
        totalMatches: result.totalMatches,
      };
    },
  });

export const valueTools = [
  createReadRangeTool,
  createWriteRangeTool,
  createAppendRowsTool,
  createClearRangeTool,
  createBatchReadTool,
  createBatchWriteTool,
  createReadFormulasTool,
  createGetSheetHeadersTool,
  createSearchDataTool,
];
