/**
 * Advanced Tools (Charts, Data Validation, Conditional Formatting, Protected Ranges)
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
// Chart Tools
// ============================================

export const createCreateChartTool = (env: Env) =>
  createPrivateTool({
    id: "create_chart",
    description:
      "Create a chart (bar, line, column, area, or pie) from spreadsheet data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID where data is located"),
      chartType: z
        .enum(["BAR", "LINE", "COLUMN", "AREA", "PIE"])
        .describe("Type of chart"),
      startRow: z.coerce.number().describe("Start row of data range (0-based)"),
      endRow: z.coerce.number().describe("End row of data range (exclusive)"),
      startColumn: z.coerce
        .number()
        .describe("Start column of data range (0-based)"),
      endColumn: z.coerce
        .number()
        .describe("End column of data range (exclusive)"),
      positionRow: z.coerce
        .number()
        .describe("Row where chart anchor will be placed"),
      positionColumn: z.coerce
        .number()
        .describe("Column where chart anchor will be placed"),
      title: z.string().optional().describe("Chart title"),
      width: z.coerce
        .number()
        .optional()
        .describe("Chart width in pixels (default: 600)"),
      height: z.coerce
        .number()
        .optional()
        .describe("Chart height in pixels (default: 400)"),
      legendPosition: z
        .string()
        .optional()
        .describe(
          "Legend position: BOTTOM_LEGEND, RIGHT_LEGEND, TOP_LEGEND, LEFT_LEGEND, NO_LEGEND",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addChart(
        context.spreadsheetId,
        context.sheetId,
        context.chartType,
        {
          startRow: context.startRow,
          endRow: context.endRow,
          startCol: context.startColumn,
          endCol: context.endColumn,
        },
        {
          row: context.positionRow,
          col: context.positionColumn,
          width: context.width,
          height: context.height,
        },
        {
          title: context.title,
          legendPosition: context.legendPosition,
        },
      );
      return {
        success: true,
        message: `${context.chartType} chart created successfully`,
      };
    },
  });

export const createDeleteChartTool = (env: Env) =>
  createPrivateTool({
    id: "delete_chart",
    description: "Delete a chart from a spreadsheet by its ID.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      chartId: z.coerce.number().describe("Chart ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteChart(context.spreadsheetId, context.chartId);
      return { success: true, message: `Chart ${context.chartId} deleted` };
    },
  });

// ============================================
// Data Validation Tools
// ============================================

export const createAddDataValidationTool = (env: Env) =>
  createPrivateTool({
    id: "add_data_validation",
    description:
      "Add data validation (dropdown list, checkbox, number constraints, etc.) to a cell range.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      validationType: z
        .enum([
          "ONE_OF_LIST",
          "ONE_OF_RANGE",
          "BOOLEAN",
          "NUMBER_GREATER",
          "NUMBER_LESS",
          "NUMBER_BETWEEN",
          "TEXT_CONTAINS",
          "CUSTOM_FORMULA",
        ])
        .describe("Type of validation"),
      values: z
        .array(z.string())
        .optional()
        .describe(
          "Values for validation (list items, formula, range, or comparison values)",
        ),
      strict: z
        .boolean()
        .optional()
        .describe("Reject invalid input (default: true)"),
      showDropdown: z
        .boolean()
        .optional()
        .describe("Show dropdown UI for lists (default: true)"),
      inputMessage: z
        .string()
        .optional()
        .describe("Message shown when cell is selected"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.setDataValidation(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          type: context.validationType,
          values: context.values,
          strict: context.strict,
          showDropdown: context.showDropdown,
          inputMessage: context.inputMessage,
        },
      );
      return {
        success: true,
        message: `Data validation (${context.validationType}) applied successfully`,
      };
    },
  });

export const createClearDataValidationTool = (env: Env) =>
  createPrivateTool({
    id: "clear_data_validation",
    description: "Remove data validation from a cell range.",
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
      await client.clearDataValidation(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
      );
      return { success: true, message: "Data validation cleared" };
    },
  });

// ============================================
// Conditional Formatting Tools
// ============================================

export const createAddConditionalFormattingTool = (env: Env) =>
  createPrivateTool({
    id: "add_conditional_formatting",
    description:
      "Add a conditional formatting rule that applies formatting when a condition is met.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      conditionType: z
        .enum([
          "NUMBER_GREATER",
          "NUMBER_GREATER_THAN_EQ",
          "NUMBER_LESS",
          "NUMBER_LESS_THAN_EQ",
          "NUMBER_EQ",
          "NUMBER_NOT_EQ",
          "NUMBER_BETWEEN",
          "NUMBER_NOT_BETWEEN",
          "TEXT_CONTAINS",
          "TEXT_NOT_CONTAINS",
          "TEXT_STARTS_WITH",
          "TEXT_ENDS_WITH",
          "TEXT_EQ",
          "TEXT_IS_EMAIL",
          "TEXT_IS_URL",
          "DATE_EQ",
          "DATE_BEFORE",
          "DATE_AFTER",
          "DATE_ON_OR_BEFORE",
          "DATE_ON_OR_AFTER",
          "DATE_BETWEEN",
          "DATE_NOT_BETWEEN",
          "DATE_IS_VALID",
          "BLANK",
          "NOT_BLANK",
          "CUSTOM_FORMULA",
          "BOOLEAN",
        ])
        .describe("Type of condition"),
      conditionValues: z
        .array(z.string())
        .optional()
        .describe("Values for comparison (e.g., ['100'] for NUMBER_GREATER)"),
      backgroundColor: ColorSchema.optional().describe(
        "Background color when condition is true",
      ),
      textColor: ColorSchema.optional().describe(
        "Text color when condition is true",
      ),
      bold: z.boolean().optional().describe("Bold text when condition is true"),
      italic: z
        .boolean()
        .optional()
        .describe("Italic text when condition is true"),
      ruleIndex: z.coerce
        .number()
        .optional()
        .describe("Rule priority index (0 = highest priority)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addConditionalFormatRule(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          type: context.conditionType,
          values: context.conditionValues,
        },
        {
          backgroundColor: context.backgroundColor,
          textColor: context.textColor,
          bold: context.bold,
          italic: context.italic,
        },
        context.ruleIndex ?? 0,
      );
      return {
        success: true,
        message: `Conditional formatting rule (${context.conditionType}) added`,
      };
    },
  });

export const createClearConditionalFormattingTool = (env: Env) =>
  createPrivateTool({
    id: "clear_conditional_formatting",
    description: "Remove a conditional formatting rule by its index.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      ruleIndex: z.coerce
        .number()
        .describe("Index of the rule to delete (0 = first rule)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteConditionalFormatRule(
        context.spreadsheetId,
        context.sheetId,
        context.ruleIndex,
      );
      return {
        success: true,
        message: `Conditional formatting rule at index ${context.ruleIndex} deleted`,
      };
    },
  });

// ============================================
// Protected Range Tools
// ============================================

export const createProtectRangeTool = (env: Env) =>
  createPrivateTool({
    id: "protect_range",
    description:
      "Protect a range of cells from editing. Use this to prevent accidental changes to formulas or important data.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.coerce.number().describe("Sheet ID (numeric)"),
      startRow: z.coerce.number().describe("Start row index (0-based)"),
      endRow: z.coerce.number().describe("End row index (exclusive)"),
      startColumn: z.coerce.number().describe("Start column index (0-based)"),
      endColumn: z.coerce.number().describe("End column index (exclusive)"),
      description: z
        .string()
        .optional()
        .describe("Description of why this range is protected"),
      warningOnly: z
        .boolean()
        .optional()
        .describe(
          "If true, show warning but allow edit (default: false = block edit)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.addProtectedRange(
        context.spreadsheetId,
        context.sheetId,
        context.startRow,
        context.endRow,
        context.startColumn,
        context.endColumn,
        {
          description: context.description,
          warningOnly: context.warningOnly,
        },
      );
      return { success: true, message: "Range protected successfully" };
    },
  });

export const createUnprotectRangeTool = (env: Env) =>
  createPrivateTool({
    id: "unprotect_range",
    description: "Remove protection from a range by its protected range ID.",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      protectedRangeId: z.coerce
        .number()
        .describe("Protected range ID to remove"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SheetsClient({ accessToken: getAccessToken(env) });
      await client.deleteProtectedRange(
        context.spreadsheetId,
        context.protectedRangeId,
      );
      return {
        success: true,
        message: `Protected range ${context.protectedRangeId} removed`,
      };
    },
  });

export const advancedTools = [
  createCreateChartTool,
  createDeleteChartTool,
  createAddDataValidationTool,
  createClearDataValidationTool,
  createAddConditionalFormattingTool,
  createClearConditionalFormattingTool,
  createProtectRangeTool,
  createUnprotectRangeTool,
];
