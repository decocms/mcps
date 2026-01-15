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
}

export { getAccessToken } from "./env.ts";
