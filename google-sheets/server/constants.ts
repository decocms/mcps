/**
 * Google Sheets API constants
 */

export const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export const DRIVE_API_FILES = "https://www.googleapis.com/drive/v3/files";

export const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

export const ENDPOINTS = {
  SPREADSHEETS: SHEETS_API_BASE,
  DRIVE_FILES: DRIVE_API_FILES,
  SPREADSHEET: (spreadsheetId: string) => `${SHEETS_API_BASE}/${spreadsheetId}`,
  VALUES: (spreadsheetId: string, range: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  VALUES_APPEND: (spreadsheetId: string, range: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
  VALUES_CLEAR: (spreadsheetId: string, range: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
  VALUES_BATCH_GET: (spreadsheetId: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet`,
  VALUES_BATCH_UPDATE: (spreadsheetId: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`,
  BATCH_UPDATE: (spreadsheetId: string) =>
    `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
};

export const VALUE_INPUT_OPTION = {
  RAW: "RAW",
  USER_ENTERED: "USER_ENTERED",
} as const;

export const VALUE_RENDER_OPTION = {
  FORMATTED_VALUE: "FORMATTED_VALUE",
  UNFORMATTED_VALUE: "UNFORMATTED_VALUE",
  FORMULA: "FORMULA",
} as const;

export const INSERT_DATA_OPTION = {
  OVERWRITE: "OVERWRITE",
  INSERT_ROWS: "INSERT_ROWS",
} as const;

export const DIMENSION = {
  ROWS: "ROWS",
  COLUMNS: "COLUMNS",
} as const;

// Google OAuth scopes
// drive.file is non-sensitive (no Google verification review needed) and
// covers Sheets API create/read/edit plus Drive listing — but only for files
// created or opened through this app.
export const GOOGLE_SCOPES = {
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;
