/**
 * Google Sheets API types
 */

export interface Spreadsheet {
  spreadsheetId: string;
  properties: SpreadsheetProperties;
  sheets?: Sheet[];
  spreadsheetUrl?: string;
}

export interface SpreadsheetProperties {
  title: string;
  locale?: string;
  autoRecalc?: string;
  timeZone?: string;
}

export interface Sheet {
  properties: SheetProperties;
  data?: GridData[];
}

export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
  sheetType?: string;
  gridProperties?: GridProperties;
}

export interface GridProperties {
  rowCount?: number;
  columnCount?: number;
  frozenRowCount?: number;
  frozenColumnCount?: number;
}

export interface GridData {
  startRow?: number;
  startColumn?: number;
  rowData?: RowData[];
}

export interface RowData {
  values?: CellData[];
}

export interface CellData {
  userEnteredValue?: ExtendedValue;
  effectiveValue?: ExtendedValue;
  formattedValue?: string;
  userEnteredFormat?: CellFormat;
  effectiveFormat?: CellFormat;
}

export interface ExtendedValue {
  numberValue?: number;
  stringValue?: string;
  boolValue?: boolean;
  formulaValue?: string;
  errorValue?: ErrorValue;
}

export interface ErrorValue {
  type: string;
  message: string;
}

export interface CellFormat {
  backgroundColor?: Color;
  textFormat?: TextFormat;
  horizontalAlignment?: string;
  verticalAlignment?: string;
  numberFormat?: NumberFormat;
}

export interface Color {
  red?: number;
  green?: number;
  blue?: number;
  alpha?: number;
}

export interface TextFormat {
  foregroundColor?: Color;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

export interface NumberFormat {
  type: string;
  pattern?: string;
}

export interface ValueRange {
  range: string;
  majorDimension?: "ROWS" | "COLUMNS";
  values: any[][];
}

export interface BatchGetValuesResponse {
  spreadsheetId: string;
  valueRanges: ValueRange[];
}

export interface BatchUpdateValuesRequest {
  valueInputOption: "RAW" | "USER_ENTERED";
  data: ValueRange[];
}

export interface BatchUpdateValuesResponse {
  spreadsheetId: string;
  totalUpdatedRows: number;
  totalUpdatedColumns: number;
  totalUpdatedCells: number;
  totalUpdatedSheets: number;
}

export interface AppendValuesResponse {
  spreadsheetId: string;
  tableRange: string;
  updates: {
    spreadsheetId: string;
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
  };
}

export interface Request {
  addSheet?: AddSheetRequest;
  deleteSheet?: DeleteSheetRequest;
  updateSheetProperties?: UpdateSheetPropertiesRequest;
  repeatCell?: RepeatCellRequest;
  autoResizeDimensions?: AutoResizeDimensionsRequest;
  sortRange?: SortRangeRequest;
  setBasicFilter?: SetBasicFilterRequest;
  clearBasicFilter?: ClearBasicFilterRequest;
  findReplace?: FindReplaceRequest;
}

export interface AddSheetRequest {
  properties: SheetProperties;
}

export interface DeleteSheetRequest {
  sheetId: number;
}

export interface UpdateSheetPropertiesRequest {
  properties: SheetProperties;
  fields: string;
}

export interface RepeatCellRequest {
  range: GridRange;
  cell: CellData;
  fields: string;
}

export interface GridRange {
  sheetId: number;
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

export interface AutoResizeDimensionsRequest {
  dimensions: DimensionRange;
}

export interface DimensionRange {
  sheetId: number;
  dimension: "ROWS" | "COLUMNS";
  startIndex?: number;
  endIndex?: number;
}

export interface SortRangeRequest {
  range: GridRange;
  sortSpecs: SortSpec[];
}

export interface SortSpec {
  dimensionIndex: number;
  sortOrder: "ASCENDING" | "DESCENDING";
}

export interface SetBasicFilterRequest {
  filter: BasicFilter;
}

export interface BasicFilter {
  range: GridRange;
  sortSpecs?: SortSpec[];
  criteria?: Record<string, FilterCriteria>;
}

export interface FilterCriteria {
  hiddenValues?: string[];
  condition?: BooleanCondition;
}

export interface BooleanCondition {
  type: string;
  values?: ConditionValue[];
}

export interface ConditionValue {
  relativeDate?: string;
  userEnteredValue?: string;
}

export interface ClearBasicFilterRequest {
  sheetId: number;
}

export interface FindReplaceRequest {
  find: string;
  replacement: string;
  matchCase?: boolean;
  matchEntireCell?: boolean;
  searchByRegex?: boolean;
  includeFormulas?: boolean;
  range?: GridRange;
  sheetId?: number;
  allSheets?: boolean;
}

export interface FindReplaceResponse {
  valuesChanged: number;
  formulasChanged: number;
  rowsChanged: number;
  sheetsChanged: number;
  occurrencesChanged: number;
}

export interface BatchUpdateResponse {
  spreadsheetId: string;
  replies: any[];
  updatedSpreadsheet?: Spreadsheet;
}
