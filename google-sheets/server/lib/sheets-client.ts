/**
 * Google Sheets API client
 */

import { ENDPOINTS, INSERT_DATA_OPTION } from "../constants.ts";
import type {
  Spreadsheet,
  ValueRange,
  BatchUpdateValuesResponse,
  AppendValuesResponse,
  BatchUpdateResponse,
  Request,
} from "./types.ts";
import { calculateDataRange } from "./utils.ts";

export class SheetsClient {
  private accessToken: string;

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sheets API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // Spreadsheet operations
  async createSpreadsheet(title: string): Promise<Spreadsheet> {
    return this.request<Spreadsheet>(ENDPOINTS.SPREADSHEETS, {
      method: "POST",
      body: JSON.stringify({ properties: { title } }),
    });
  }

  async getSpreadsheet(
    spreadsheetId: string,
    includeGridData = false,
  ): Promise<Spreadsheet> {
    const url = new URL(ENDPOINTS.SPREADSHEET(spreadsheetId));
    if (includeGridData) url.searchParams.set("includeGridData", "true");
    return this.request<Spreadsheet>(url.toString());
  }

  async copySpreadsheet(
    spreadsheetId: string,
    destinationSpreadsheetId: string,
    sheetId: number,
  ): Promise<any> {
    const url = `${ENDPOINTS.SPREADSHEET(spreadsheetId)}/sheets/${sheetId}:copyTo`;
    return this.request<any>(url, {
      method: "POST",
      body: JSON.stringify({ destinationSpreadsheetId }),
    });
  }

  // Sheet operations
  async addSheet(
    spreadsheetId: string,
    title: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { addSheet: { properties: { title } } },
    ]);
  }

  async deleteSheet(
    spreadsheetId: string,
    sheetId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [{ deleteSheet: { sheetId } }]);
  }

  async renameSheet(
    spreadsheetId: string,
    sheetId: number,
    newTitle: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        updateSheetProperties: {
          properties: { sheetId, title: newTitle },
          fields: "title",
        },
      },
    ]);
  }

  // Value operations
  async readRange(spreadsheetId: string, range: string): Promise<ValueRange> {
    return this.request<ValueRange>(ENDPOINTS.VALUES(spreadsheetId, range));
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  ): Promise<any> {
    const url = new URL(ENDPOINTS.VALUES(spreadsheetId, range));
    url.searchParams.set("valueInputOption", valueInputOption);
    return this.request<any>(url.toString(), {
      method: "PUT",
      body: JSON.stringify({ range, values }),
    });
  }

  async appendRows(
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  ): Promise<AppendValuesResponse> {
    const url = new URL(ENDPOINTS.VALUES_APPEND(spreadsheetId, range));
    url.searchParams.set("valueInputOption", valueInputOption);
    url.searchParams.set("insertDataOption", INSERT_DATA_OPTION.INSERT_ROWS);
    return this.request<AppendValuesResponse>(url.toString(), {
      method: "POST",
      body: JSON.stringify({ range, values }),
    });
  }

  async clearRange(spreadsheetId: string, range: string): Promise<any> {
    return this.request<any>(ENDPOINTS.VALUES_CLEAR(spreadsheetId, range), {
      method: "POST",
    });
  }

  async batchGetValues(spreadsheetId: string, ranges: string[]): Promise<any> {
    const url = new URL(ENDPOINTS.VALUES_BATCH_GET(spreadsheetId));
    ranges.forEach((r) => url.searchParams.append("ranges", r));
    return this.request<any>(url.toString());
  }

  async batchUpdateValues(
    spreadsheetId: string,
    data: Array<{ range: string; values: any[][] }>,
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  ): Promise<BatchUpdateValuesResponse> {
    return this.request<BatchUpdateValuesResponse>(
      ENDPOINTS.VALUES_BATCH_UPDATE(spreadsheetId),
      {
        method: "POST",
        body: JSON.stringify({ valueInputOption, data }),
      },
    );
  }

  // Batch update (formatting, sorting, etc.)
  async batchUpdate(
    spreadsheetId: string,
    requests: Request[],
  ): Promise<BatchUpdateResponse> {
    return this.request<BatchUpdateResponse>(
      ENDPOINTS.BATCH_UPDATE(spreadsheetId),
      {
        method: "POST",
        body: JSON.stringify({ requests }),
      },
    );
  }

  // Format cells
  async formatCells(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    format: {
      bold?: boolean;
      italic?: boolean;
      fontSize?: number;
      backgroundColor?: { red: number; green: number; blue: number };
      textColor?: { red: number; green: number; blue: number };
    },
  ): Promise<BatchUpdateResponse> {
    const cell: any = { userEnteredFormat: {} };
    const fields: string[] = [];

    if (format.bold !== undefined) {
      cell.userEnteredFormat.textFormat = {
        ...cell.userEnteredFormat.textFormat,
        bold: format.bold,
      };
      fields.push("userEnteredFormat.textFormat.bold");
    }
    if (format.italic !== undefined) {
      cell.userEnteredFormat.textFormat = {
        ...cell.userEnteredFormat.textFormat,
        italic: format.italic,
      };
      fields.push("userEnteredFormat.textFormat.italic");
    }
    if (format.fontSize !== undefined) {
      cell.userEnteredFormat.textFormat = {
        ...cell.userEnteredFormat.textFormat,
        fontSize: format.fontSize,
      };
      fields.push("userEnteredFormat.textFormat.fontSize");
    }
    if (format.backgroundColor) {
      cell.userEnteredFormat.backgroundColor = format.backgroundColor;
      fields.push("userEnteredFormat.backgroundColor");
    }
    if (format.textColor) {
      cell.userEnteredFormat.textFormat = {
        ...cell.userEnteredFormat.textFormat,
        foregroundColor: format.textColor,
      };
      fields.push("userEnteredFormat.textFormat.foregroundColor");
    }

    return this.batchUpdate(spreadsheetId, [
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          cell,
          fields: fields.join(","),
        },
      },
    ]);
  }

  // Auto resize columns
  async autoResizeColumns(
    spreadsheetId: string,
    sheetId: number,
    startIndex: number,
    endIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: "COLUMNS", startIndex, endIndex },
        },
      },
    ]);
  }

  // Sort range
  async sortRange(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    sortColumn: number,
    ascending = true,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        sortRange: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          sortSpecs: [
            {
              dimensionIndex: sortColumn,
              sortOrder: ascending ? "ASCENDING" : "DESCENDING",
            },
          ],
        },
      },
    ]);
  }

  // Find and replace
  async findReplace(
    spreadsheetId: string,
    find: string,
    replacement: string,
    options: {
      matchCase?: boolean;
      matchEntireCell?: boolean;
      allSheets?: boolean;
      sheetId?: number;
    } = {},
  ): Promise<any> {
    return this.batchUpdate(spreadsheetId, [
      {
        findReplace: {
          find,
          replacement,
          matchCase: options.matchCase,
          matchEntireCell: options.matchEntireCell,
          allSheets: options.allSheets ?? true,
          sheetId: options.sheetId,
        },
      },
    ]);
  }

  // ============================================
  // Dimension Operations (Insert/Delete/Move)
  // ============================================

  async insertDimension(
    spreadsheetId: string,
    sheetId: number,
    dimension: "ROWS" | "COLUMNS",
    startIndex: number,
    endIndex: number,
    inheritFromBefore = false,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        insertDimension: {
          range: { sheetId, dimension, startIndex, endIndex },
          inheritFromBefore,
        },
      },
    ]);
  }

  async deleteDimension(
    spreadsheetId: string,
    sheetId: number,
    dimension: "ROWS" | "COLUMNS",
    startIndex: number,
    endIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        deleteDimension: {
          range: { sheetId, dimension, startIndex, endIndex },
        },
      },
    ]);
  }

  async moveDimension(
    spreadsheetId: string,
    sheetId: number,
    dimension: "ROWS" | "COLUMNS",
    startIndex: number,
    endIndex: number,
    destinationIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        moveDimension: {
          source: { sheetId, dimension, startIndex, endIndex },
          destinationIndex,
        },
      },
    ]);
  }

  async updateDimensionProperties(
    spreadsheetId: string,
    sheetId: number,
    dimension: "ROWS" | "COLUMNS",
    startIndex: number,
    endIndex: number,
    properties: { pixelSize?: number; hiddenByUser?: boolean },
  ): Promise<BatchUpdateResponse> {
    const fields: string[] = [];
    if (properties.pixelSize !== undefined) fields.push("pixelSize");
    if (properties.hiddenByUser !== undefined) fields.push("hiddenByUser");

    return this.batchUpdate(spreadsheetId, [
      {
        updateDimensionProperties: {
          range: { sheetId, dimension, startIndex, endIndex },
          properties,
          fields: fields.join(","),
        },
      },
    ]);
  }

  // ============================================
  // Chart Operations
  // ============================================

  async addChart(
    spreadsheetId: string,
    sheetId: number,
    chartType: "BAR" | "LINE" | "AREA" | "COLUMN" | "PIE",
    sourceRange: {
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    },
    position: { row: number; col: number; width?: number; height?: number },
    options: { title?: string; legendPosition?: string } = {},
  ): Promise<BatchUpdateResponse> {
    const range = {
      sheetId,
      startRowIndex: sourceRange.startRow,
      endRowIndex: sourceRange.endRow,
      startColumnIndex: sourceRange.startCol,
      endColumnIndex: sourceRange.endCol,
    };

    const chartSpec: any = { title: options.title };

    if (chartType === "PIE") {
      chartSpec.pieChart = {
        legendPosition: options.legendPosition || "RIGHT_LEGEND",
        domain: { sourceRange: { sources: [range] } },
        series: { sourceRange: { sources: [range] } },
      };
    } else {
      chartSpec.basicChart = {
        chartType,
        legendPosition: options.legendPosition || "BOTTOM_LEGEND",
        domains: [{ domain: { sourceRange: { sources: [range] } } }],
        series: [{ series: { sourceRange: { sources: [range] } } }],
      };
    }

    return this.batchUpdate(spreadsheetId, [
      {
        addChart: {
          chart: {
            spec: chartSpec,
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: position.row,
                  columnIndex: position.col,
                },
                widthPixels: position.width || 600,
                heightPixels: position.height || 400,
              },
            },
          },
        },
      },
    ]);
  }

  async deleteChart(
    spreadsheetId: string,
    chartId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { deleteEmbeddedObject: { objectId: chartId } },
    ]);
  }

  // ============================================
  // Data Validation
  // ============================================

  async setDataValidation(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    rule: {
      type:
        | "ONE_OF_LIST"
        | "ONE_OF_RANGE"
        | "BOOLEAN"
        | "NUMBER_GREATER"
        | "NUMBER_LESS"
        | "NUMBER_BETWEEN"
        | "TEXT_CONTAINS"
        | "CUSTOM_FORMULA";
      values?: string[];
      strict?: boolean;
      showDropdown?: boolean;
      inputMessage?: string;
    },
  ): Promise<BatchUpdateResponse> {
    const condition: any = { type: rule.type };
    if (rule.values && rule.values.length > 0) {
      condition.values = rule.values.map((v) => ({ userEnteredValue: v }));
    }

    return this.batchUpdate(spreadsheetId, [
      {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          rule: {
            condition,
            strict: rule.strict ?? true,
            showCustomUi: rule.showDropdown ?? true,
            inputMessage: rule.inputMessage,
          },
        },
      },
    ]);
  }

  async clearDataValidation(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          rule: undefined,
        },
      },
    ]);
  }

  // ============================================
  // Conditional Formatting
  // ============================================

  async addConditionalFormatRule(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    condition: {
      type: string;
      values?: string[];
    },
    format: {
      backgroundColor?: { red: number; green: number; blue: number };
      textColor?: { red: number; green: number; blue: number };
      bold?: boolean;
      italic?: boolean;
    },
    index = 0,
  ): Promise<BatchUpdateResponse> {
    const booleanCondition: any = { type: condition.type };
    if (condition.values) {
      booleanCondition.values = condition.values.map((v) => ({
        userEnteredValue: v,
      }));
    }

    const cellFormat: any = {};
    if (format.backgroundColor) {
      cellFormat.backgroundColor = format.backgroundColor;
    }
    if (
      format.textColor ||
      format.bold !== undefined ||
      format.italic !== undefined
    ) {
      cellFormat.textFormat = {};
      if (format.textColor)
        cellFormat.textFormat.foregroundColor = format.textColor;
      if (format.bold !== undefined) cellFormat.textFormat.bold = format.bold;
      if (format.italic !== undefined)
        cellFormat.textFormat.italic = format.italic;
    }

    return this.batchUpdate(spreadsheetId, [
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: startRow,
                endRowIndex: endRow,
                startColumnIndex: startCol,
                endColumnIndex: endCol,
              },
            ],
            booleanRule: {
              condition: booleanCondition,
              format: cellFormat,
            },
          },
          index,
        },
      },
    ]);
  }

  async deleteConditionalFormatRule(
    spreadsheetId: string,
    sheetId: number,
    index: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        deleteConditionalFormatRule: { sheetId, index },
      },
    ]);
  }

  // ============================================
  // Protected Ranges
  // ============================================

  async addProtectedRange(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    options: {
      description?: string;
      warningOnly?: boolean;
    } = {},
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow,
              startColumnIndex: startCol,
              endColumnIndex: endCol,
            },
            description: options.description,
            warningOnly: options.warningOnly ?? false,
          },
        },
      },
    ]);
  }

  async deleteProtectedRange(
    spreadsheetId: string,
    protectedRangeId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { deleteProtectedRange: { protectedRangeId } },
    ]);
  }

  // ============================================
  // Merge Cells
  // ============================================

  async mergeCells(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    mergeType: "MERGE_ALL" | "MERGE_COLUMNS" | "MERGE_ROWS" = "MERGE_ALL",
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          mergeType,
        },
      },
    ]);
  }

  async unmergeCells(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        unmergeCells: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
        },
      },
    ]);
  }

  // ============================================
  // Borders
  // ============================================

  async updateBorders(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    borders: {
      top?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
      bottom?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
      left?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
      right?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
      innerHorizontal?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
      innerVertical?: {
        style: string;
        color?: { red: number; green: number; blue: number };
      };
    },
  ): Promise<BatchUpdateResponse> {
    const request: any = {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
    };

    if (borders.top) request.top = borders.top;
    if (borders.bottom) request.bottom = borders.bottom;
    if (borders.left) request.left = borders.left;
    if (borders.right) request.right = borders.right;
    if (borders.innerHorizontal)
      request.innerHorizontal = borders.innerHorizontal;
    if (borders.innerVertical) request.innerVertical = borders.innerVertical;

    return this.batchUpdate(spreadsheetId, [{ updateBorders: request }]);
  }

  // ============================================
  // Banding (Alternating Colors)
  // ============================================

  async addBanding(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    colors: {
      headerColor?: { red: number; green: number; blue: number };
      firstBandColor?: { red: number; green: number; blue: number };
      secondBandColor?: { red: number; green: number; blue: number };
      footerColor?: { red: number; green: number; blue: number };
    },
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        addBanding: {
          bandedRange: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow,
              startColumnIndex: startCol,
              endColumnIndex: endCol,
            },
            rowProperties: colors,
          },
        },
      },
    ]);
  }

  async deleteBanding(
    spreadsheetId: string,
    bandedRangeId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { deleteBanding: { bandedRangeId } },
    ]);
  }

  // ============================================
  // Notes
  // ============================================

  async addNote(
    spreadsheetId: string,
    sheetId: number,
    row: number,
    col: number,
    note: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        updateCells: {
          rows: [{ values: [{ note }] }],
          fields: "note",
          start: { sheetId, rowIndex: row, columnIndex: col },
        },
      },
    ]);
  }

  // ============================================
  // Number Format
  // ============================================

  async setNumberFormat(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    format: {
      type:
        | "TEXT"
        | "NUMBER"
        | "PERCENT"
        | "CURRENCY"
        | "DATE"
        | "TIME"
        | "DATE_TIME"
        | "SCIENTIFIC";
      pattern?: string;
    },
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: format,
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      },
    ]);
  }

  // ============================================
  // Filter Operations
  // ============================================

  async setBasicFilter(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    criteria?: Record<number, { hiddenValues?: string[] }>,
  ): Promise<BatchUpdateResponse> {
    const filter: any = {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
    };

    if (criteria) {
      filter.criteria = criteria;
    }

    return this.batchUpdate(spreadsheetId, [{ setBasicFilter: { filter } }]);
  }

  async clearBasicFilter(
    spreadsheetId: string,
    sheetId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [{ clearBasicFilter: { sheetId } }]);
  }

  async addFilterView(
    spreadsheetId: string,
    sheetId: number,
    title: string,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    criteria?: Record<number, { hiddenValues?: string[] }>,
  ): Promise<BatchUpdateResponse> {
    const filter: any = {
      title,
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
    };

    if (criteria) {
      filter.criteria = criteria;
    }

    return this.batchUpdate(spreadsheetId, [{ addFilterView: { filter } }]);
  }

  async deleteFilterView(
    spreadsheetId: string,
    filterId: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { deleteFilterView: { filterId } },
    ]);
  }

  // ============================================
  // Slicers
  // ============================================

  async addSlicer(
    spreadsheetId: string,
    sheetId: number,
    dataRange: {
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    },
    position: { row: number; col: number; width?: number; height?: number },
    options: {
      title?: string;
      columnIndex?: number;
      backgroundColor?: { red: number; green: number; blue: number };
    } = {},
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        addSlicer: {
          slicer: {
            spec: {
              dataRange: {
                sheetId,
                startRowIndex: dataRange.startRow,
                endRowIndex: dataRange.endRow,
                startColumnIndex: dataRange.startCol,
                endColumnIndex: dataRange.endCol,
              },
              columnIndex: options.columnIndex,
              title: options.title,
              backgroundColor: options.backgroundColor,
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: position.row,
                  columnIndex: position.col,
                },
                widthPixels: position.width || 200,
                heightPixels: position.height || 200,
              },
            },
          },
        },
      },
    ]);
  }

  // ============================================
  // Named Ranges
  // ============================================

  async addNamedRange(
    spreadsheetId: string,
    name: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        addNamedRange: {
          namedRange: {
            name,
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow,
              startColumnIndex: startCol,
              endColumnIndex: endCol,
            },
          },
        },
      },
    ]);
  }

  async deleteNamedRange(
    spreadsheetId: string,
    namedRangeId: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      { deleteNamedRange: { namedRangeId } },
    ]);
  }

  // ============================================
  // Pivot Tables
  // ============================================

  async createPivotTable(
    spreadsheetId: string,
    sourceSheetId: number,
    sourceRange: {
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    },
    destinationSheetId: number,
    destinationRow: number,
    destinationCol: number,
    config: {
      rows?: Array<{
        sourceColumnOffset: number;
        showTotals?: boolean;
        sortOrder?: "ASCENDING" | "DESCENDING";
      }>;
      columns?: Array<{
        sourceColumnOffset: number;
        showTotals?: boolean;
        sortOrder?: "ASCENDING" | "DESCENDING";
      }>;
      values?: Array<{
        sourceColumnOffset: number;
        summarizeFunction: string;
        name?: string;
      }>;
    },
  ): Promise<BatchUpdateResponse> {
    const pivotTable: any = {
      source: {
        sheetId: sourceSheetId,
        startRowIndex: sourceRange.startRow,
        endRowIndex: sourceRange.endRow,
        startColumnIndex: sourceRange.startCol,
        endColumnIndex: sourceRange.endCol,
      },
      rows: config.rows || [],
      columns: config.columns || [],
      values: config.values || [],
    };

    return this.batchUpdate(spreadsheetId, [
      {
        updateCells: {
          rows: [{ values: [{ pivotTable }] }],
          fields: "pivotTable",
          start: {
            sheetId: destinationSheetId,
            rowIndex: destinationRow,
            columnIndex: destinationCol,
          },
        },
      },
    ]);
  }

  // ============================================
  // Duplicate Sheet
  // ============================================

  async duplicateSheet(
    spreadsheetId: string,
    sourceSheetId: number,
    newSheetName?: string,
    insertSheetIndex?: number,
  ): Promise<BatchUpdateResponse> {
    const request: any = {
      sourceSheetId,
    };
    if (newSheetName) request.newSheetName = newSheetName;
    if (insertSheetIndex !== undefined)
      request.insertSheetIndex = insertSheetIndex;

    return this.batchUpdate(spreadsheetId, [{ duplicateSheet: request }]);
  }

  // ============================================
  // Freeze Rows/Columns
  // ============================================

  async freezeRows(
    spreadsheetId: string,
    sheetId: number,
    frozenRowCount: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount },
          },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ]);
  }

  async freezeColumns(
    spreadsheetId: string,
    sheetId: number,
    frozenColumnCount: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(spreadsheetId, [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenColumnCount },
          },
          fields: "gridProperties.frozenColumnCount",
        },
      },
    ]);
  }

  // ============================================
  // Read Formulas (not just values)
  // ============================================

  async readFormulas(
    spreadsheetId: string,
    range: string,
  ): Promise<ValueRange> {
    const url = new URL(ENDPOINTS.VALUES(spreadsheetId, range));
    url.searchParams.set("valueRenderOption", "FORMULA");
    return this.request<ValueRange>(url.toString());
  }

  // ============================================
  // Enhanced Metadata Operations
  // ============================================

  /**
   * Get the actual data range for a sheet (where data exists, not full grid)
   */
  async getSheetDataRange(
    spreadsheetId: string,
    sheetTitle: string,
  ): Promise<{ range: string; filledCells: number } | null> {
    try {
      const result = await this.readRange(spreadsheetId, sheetTitle);
      if (!result.values || result.values.length === 0) {
        return null;
      }
      return calculateDataRange(result.values, sheetTitle);
    } catch {
      return null;
    }
  }

  /**
   * Get metadata for all sheets including actual data ranges
   */
  async getSpreadsheetWithDataRanges(spreadsheetId: string): Promise<{
    spreadsheet: Spreadsheet;
    dataRanges: Record<string, { range: string; filledCells: number }>;
  }> {
    const spreadsheet = await this.getSpreadsheet(spreadsheetId);
    const dataRanges: Record<string, { range: string; filledCells: number }> =
      {};

    if (spreadsheet.sheets) {
      const promises = spreadsheet.sheets.map(async (sheet) => {
        const title = sheet.properties?.title;
        if (title) {
          const rangeInfo = await this.getSheetDataRange(spreadsheetId, title);
          if (rangeInfo) {
            dataRanges[title] = rangeInfo;
          }
        }
      });
      await Promise.all(promises);
    }

    return { spreadsheet, dataRanges };
  }

  /**
   * Copy a sheet to a destination spreadsheet (or within the same one)
   */
  async copySheetTo(
    spreadsheetId: string,
    sheetId: number,
    destinationSpreadsheetId?: string,
  ): Promise<{ sheetId: number; title: string }> {
    const url = `${ENDPOINTS.SPREADSHEET(spreadsheetId)}/sheets/${sheetId}:copyTo`;
    const result = await this.request<{
      sheetId: number;
      title: string;
      index: number;
    }>(url, {
      method: "POST",
      body: JSON.stringify({
        destinationSpreadsheetId: destinationSpreadsheetId || spreadsheetId,
      }),
    });
    return { sheetId: result.sheetId, title: result.title };
  }

  /**
   * Get headers from a specific row of a sheet
   */
  async getSheetHeaders(
    spreadsheetId: string,
    sheetName: string,
    range: string = "A:Z",
    headerRow: number = 1,
  ): Promise<ValueRange> {
    const rangeStart = range.split(":")[0].replace(/[0-9]/g, "");
    const rangeEnd = range.split(":")[1].replace(/[0-9]/g, "");
    const headerRange = `${sheetName}!${rangeStart}${headerRow}:${rangeEnd}${headerRow}`;
    return this.readRange(spreadsheetId, headerRange);
  }

  /**
   * Search for a term across multiple columns in a sheet
   * Returns matching rows
   */
  async searchInSheet(
    spreadsheetId: string,
    sheetName: string,
    searchTerm: string,
    options: {
      searchColumns?: number[];
      headerRow?: number;
      caseSensitive?: boolean;
    } = {},
  ): Promise<{
    headers: string[];
    matches: Array<{ rowNumber: number; values: unknown[] }>;
    totalMatches: number;
  }> {
    const { headerRow = 1, caseSensitive = false } = options;

    // Get all data from the sheet
    const result = await this.readRange(spreadsheetId, sheetName);
    const values = result.values || [];

    if (values.length === 0) {
      return { headers: [], matches: [], totalMatches: 0 };
    }

    // Extract headers
    const headers =
      headerRow > 0 && values.length >= headerRow
        ? values[headerRow - 1].map((h: unknown) => String(h || ""))
        : [];

    // Determine which columns to search
    const columnsToSearch = options.searchColumns || [];
    const searchAllColumns = columnsToSearch.length === 0;

    const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    const matches: Array<{ rowNumber: number; values: unknown[] }> = [];

    // Search through data rows (skip header if present)
    const startRow = headerRow > 0 ? headerRow : 0;

    for (let i = startRow; i < values.length; i++) {
      const row = values[i];
      if (!row) continue;

      let found = false;

      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        if (!searchAllColumns && !columnsToSearch.includes(colIndex)) {
          continue;
        }

        const cellValue = row[colIndex];
        if (cellValue === null || cellValue === undefined) continue;

        const cellStr = caseSensitive
          ? String(cellValue)
          : String(cellValue).toLowerCase();

        if (cellStr.includes(term)) {
          found = true;
          break;
        }
      }

      if (found) {
        matches.push({
          rowNumber: i + 1, // 1-based row number
          values: row,
        });
      }
    }

    return {
      headers,
      matches,
      totalMatches: matches.length,
    };
  }
}

export { getAccessToken } from "./env.ts";
