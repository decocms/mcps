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
  sheetId?: number;
  title?: string;
  index?: number;
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
  note?: string;
  pivotTable?: PivotTable;
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
  // Sheet management
  addSheet?: AddSheetRequest;
  deleteSheet?: DeleteSheetRequest;
  updateSheetProperties?: UpdateSheetPropertiesRequest;
  duplicateSheet?: DuplicateSheetRequest;

  // Cell operations
  repeatCell?: RepeatCellRequest;
  updateCells?: UpdateCellsRequest;

  // Dimensions (rows/columns)
  insertDimension?: InsertDimensionRequest;
  deleteDimension?: DeleteDimensionRequest;
  moveDimension?: MoveDimensionRequest;
  updateDimensionProperties?: UpdateDimensionPropertiesRequest;
  autoResizeDimensions?: AutoResizeDimensionsRequest;

  // Sorting and filtering
  sortRange?: SortRangeRequest;
  setBasicFilter?: SetBasicFilterRequest;
  clearBasicFilter?: ClearBasicFilterRequest;
  addFilterView?: AddFilterViewRequest;
  updateFilterView?: UpdateFilterViewRequest;
  deleteFilterView?: DeleteFilterViewRequest;
  findReplace?: FindReplaceRequest;

  // Charts
  addChart?: AddChartRequest;
  updateChartSpec?: UpdateChartSpecRequest;
  deleteEmbeddedObject?: DeleteEmbeddedObjectRequest;

  // Data validation
  setDataValidation?: SetDataValidationRequest;

  // Conditional formatting
  addConditionalFormatRule?: AddConditionalFormatRuleRequest;
  updateConditionalFormatRule?: UpdateConditionalFormatRuleRequest;
  deleteConditionalFormatRule?: DeleteConditionalFormatRuleRequest;

  // Protected ranges
  addProtectedRange?: AddProtectedRangeRequest;
  updateProtectedRange?: UpdateProtectedRangeRequest;
  deleteProtectedRange?: DeleteProtectedRangeRequest;

  // Merge cells
  mergeCells?: MergeCellsRequest;
  unmergeCells?: UnmergeCellsRequest;

  // Borders
  updateBorders?: UpdateBordersRequest;

  // Banding
  addBanding?: AddBandingRequest;
  updateBanding?: UpdateBandingRequest;
  deleteBanding?: DeleteBandingRequest;

  // Slicers
  addSlicer?: AddSlicerRequest;
  updateSlicerSpec?: UpdateSlicerSpecRequest;

  // Named ranges
  addNamedRange?: AddNamedRangeRequest;
  updateNamedRange?: UpdateNamedRangeRequest;
  deleteNamedRange?: DeleteNamedRangeRequest;

  // Copy/Cut/Paste
  copyPaste?: CopyPasteRequest;
  cutPaste?: CutPasteRequest;

  // Randomize
  randomizeRange?: RandomizeRangeRequest;
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

// ============================================
// Dimension Operations (Insert/Delete/Move/Update)
// ============================================

export interface InsertDimensionRequest {
  range: DimensionRange;
  inheritFromBefore?: boolean;
}

export interface DeleteDimensionRequest {
  range: DimensionRange;
}

export interface MoveDimensionRequest {
  source: DimensionRange;
  destinationIndex: number;
}

export interface UpdateDimensionPropertiesRequest {
  properties: DimensionProperties;
  range: DimensionRange;
  fields: string;
}

export interface DimensionProperties {
  pixelSize?: number;
  hiddenByFilter?: boolean;
  hiddenByUser?: boolean;
  developerMetadata?: any[];
}

// ============================================
// Chart Operations
// ============================================

export interface AddChartRequest {
  chart: EmbeddedChart;
}

export interface UpdateChartSpecRequest {
  chartId: number;
  spec: ChartSpec;
}

export interface DeleteEmbeddedObjectRequest {
  objectId: number;
}

export interface EmbeddedChart {
  chartId?: number;
  spec: ChartSpec;
  position: EmbeddedObjectPosition;
}

export interface EmbeddedObjectPosition {
  overlayPosition?: OverlayPosition;
  newSheet?: boolean;
}

export interface OverlayPosition {
  anchorCell: GridCoordinate;
  offsetXPixels?: number;
  offsetYPixels?: number;
  widthPixels?: number;
  heightPixels?: number;
}

export interface GridCoordinate {
  sheetId: number;
  rowIndex: number;
  columnIndex: number;
}

export interface ChartSpec {
  title?: string;
  subtitle?: string;
  titleTextFormat?: TextFormat;
  basicChart?: BasicChartSpec;
  pieChart?: PieChartSpec;
  hiddenDimensionStrategy?: string;
}

export interface BasicChartSpec {
  chartType:
    | "BAR"
    | "LINE"
    | "AREA"
    | "COLUMN"
    | "SCATTER"
    | "COMBO"
    | "STEPPED_AREA";
  legendPosition?: string;
  axis?: BasicChartAxis[];
  domains?: BasicChartDomain[];
  series?: BasicChartSeries[];
  headerCount?: number;
  stackedType?: "NOT_STACKED" | "STACKED" | "PERCENT_STACKED";
}

export interface BasicChartAxis {
  position: "BOTTOM_AXIS" | "LEFT_AXIS" | "RIGHT_AXIS";
  title?: string;
  format?: TextFormat;
}

export interface BasicChartDomain {
  domain: ChartData;
}

export interface BasicChartSeries {
  series: ChartData;
  targetAxis?: string;
  type?: string;
}

export interface ChartData {
  sourceRange: ChartSourceRange;
}

export interface ChartSourceRange {
  sources: GridRange[];
}

export interface PieChartSpec {
  legendPosition?: string;
  domain: ChartData;
  series: ChartData;
  threeDimensional?: boolean;
  pieHole?: number;
}

// ============================================
// Data Validation
// ============================================

export interface SetDataValidationRequest {
  range: GridRange;
  rule?: DataValidationRule;
}

export interface DataValidationRule {
  condition: BooleanCondition;
  inputMessage?: string;
  strict?: boolean;
  showCustomUi?: boolean;
}

// ============================================
// Conditional Formatting
// ============================================

export interface AddConditionalFormatRuleRequest {
  rule: ConditionalFormatRule;
  index?: number;
}

export interface UpdateConditionalFormatRuleRequest {
  index: number;
  rule?: ConditionalFormatRule;
  sheetId: number;
  newIndex?: number;
}

export interface DeleteConditionalFormatRuleRequest {
  index: number;
  sheetId: number;
}

export interface ConditionalFormatRule {
  ranges: GridRange[];
  booleanRule?: BooleanRule;
  gradientRule?: GradientRule;
}

export interface BooleanRule {
  condition: BooleanCondition;
  format: CellFormat;
}

export interface GradientRule {
  minpoint: InterpolationPoint;
  midpoint?: InterpolationPoint;
  maxpoint: InterpolationPoint;
}

export interface InterpolationPoint {
  color: Color;
  type: "MIN" | "MAX" | "NUMBER" | "PERCENT" | "PERCENTILE";
  value?: string;
}

// ============================================
// Protected Ranges
// ============================================

export interface AddProtectedRangeRequest {
  protectedRange: ProtectedRange;
}

export interface UpdateProtectedRangeRequest {
  protectedRange: ProtectedRange;
  fields: string;
}

export interface DeleteProtectedRangeRequest {
  protectedRangeId: number;
}

export interface ProtectedRange {
  protectedRangeId?: number;
  range?: GridRange;
  namedRangeId?: string;
  description?: string;
  warningOnly?: boolean;
  requestingUserCanEdit?: boolean;
  unprotectedRanges?: GridRange[];
  editors?: Editors;
}

export interface Editors {
  users?: string[];
  groups?: string[];
  domainUsersCanEdit?: boolean;
}

// ============================================
// Merge Cells
// ============================================

export interface MergeCellsRequest {
  range: GridRange;
  mergeType: "MERGE_ALL" | "MERGE_COLUMNS" | "MERGE_ROWS";
}

export interface UnmergeCellsRequest {
  range: GridRange;
}

// ============================================
// Borders
// ============================================

export interface UpdateBordersRequest {
  range: GridRange;
  top?: Border;
  bottom?: Border;
  left?: Border;
  right?: Border;
  innerHorizontal?: Border;
  innerVertical?: Border;
}

export interface Border {
  style: BorderStyle;
  color?: Color;
  width?: number;
}

export type BorderStyle =
  | "NONE"
  | "DOTTED"
  | "DASHED"
  | "SOLID"
  | "SOLID_MEDIUM"
  | "SOLID_THICK"
  | "DOUBLE";

// ============================================
// Banding (Alternating Colors)
// ============================================

export interface AddBandingRequest {
  bandedRange: BandedRange;
}

export interface UpdateBandingRequest {
  bandedRange: BandedRange;
  fields: string;
}

export interface DeleteBandingRequest {
  bandedRangeId: number;
}

export interface BandedRange {
  bandedRangeId?: number;
  range: GridRange;
  rowProperties?: BandingProperties;
  columnProperties?: BandingProperties;
}

export interface BandingProperties {
  headerColor?: Color;
  firstBandColor?: Color;
  secondBandColor?: Color;
  footerColor?: Color;
}

// ============================================
// Filter Views
// ============================================

export interface AddFilterViewRequest {
  filter: FilterView;
}

export interface UpdateFilterViewRequest {
  filter: FilterView;
  fields: string;
}

export interface DeleteFilterViewRequest {
  filterId: number;
}

export interface FilterView {
  filterViewId?: number;
  title: string;
  range: GridRange;
  namedRangeId?: string;
  sortSpecs?: SortSpec[];
  criteria?: Record<string, FilterCriteria>;
}

// ============================================
// Slicers
// ============================================

export interface AddSlicerRequest {
  slicer: Slicer;
}

export interface UpdateSlicerSpecRequest {
  slicerId: number;
  spec: SlicerSpec;
  fields: string;
}

export interface DeleteSlicerRequest {
  slicerId: number;
}

export interface Slicer {
  slicerId?: number;
  spec: SlicerSpec;
  position: EmbeddedObjectPosition;
}

export interface SlicerSpec {
  dataRange: GridRange;
  filterCriteria?: FilterCriteria;
  columnIndex?: number;
  applyToPivotTables?: boolean;
  title?: string;
  textFormat?: TextFormat;
  backgroundColor?: Color;
  horizontalAlignment?: string;
}

// ============================================
// Named Ranges
// ============================================

export interface AddNamedRangeRequest {
  namedRange: NamedRange;
}

export interface UpdateNamedRangeRequest {
  namedRange: NamedRange;
  fields: string;
}

export interface DeleteNamedRangeRequest {
  namedRangeId: string;
}

export interface NamedRange {
  namedRangeId?: string;
  name: string;
  range: GridRange;
}

// ============================================
// Duplicate Sheet
// ============================================

export interface DuplicateSheetRequest {
  sourceSheetId: number;
  insertSheetIndex?: number;
  newSheetId?: number;
  newSheetName?: string;
}

// ============================================
// Update Cells (for notes, pivot tables)
// ============================================

export interface UpdateCellsRequest {
  rows: RowData[];
  fields: string;
  start?: GridCoordinate;
  range?: GridRange;
}

// ============================================
// Pivot Tables
// ============================================

export interface PivotTable {
  source: GridRange;
  rows?: PivotGroup[];
  columns?: PivotGroup[];
  criteria?: Record<string, PivotFilterCriteria>;
  values?: PivotValue[];
  valueLayout?: "HORIZONTAL" | "VERTICAL";
}

export interface PivotGroup {
  sourceColumnOffset: number;
  showTotals?: boolean;
  label?: string;
  sortOrder?: "ASCENDING" | "DESCENDING";
  valueBucket?: PivotGroupValueBucket;
  groupRule?: PivotGroupRule;
}

export interface PivotGroupValueBucket {
  valuesIndex?: number;
}

export interface PivotGroupRule {
  manualRule?: ManualRule;
  histogramRule?: HistogramRule;
  dateTimeRule?: DateTimeRule;
}

export interface ManualRule {
  groups: ManualRuleGroup[];
}

export interface ManualRuleGroup {
  groupName: ExtendedValue;
  items: ExtendedValue[];
}

export interface HistogramRule {
  interval?: number;
  start?: number;
  end?: number;
}

export interface DateTimeRule {
  type: string;
}

export interface PivotFilterCriteria {
  visibleValues?: string[];
  condition?: BooleanCondition;
}

export interface PivotValue {
  summarizeFunction:
    | "SUM"
    | "COUNTA"
    | "COUNT"
    | "COUNTUNIQUE"
    | "AVERAGE"
    | "MAX"
    | "MIN"
    | "MEDIAN"
    | "PRODUCT"
    | "STDEV"
    | "STDEVP"
    | "VAR"
    | "VARP"
    | "CUSTOM";
  sourceColumnOffset?: number;
  name?: string;
  calculatedDisplayType?: string;
  formula?: string;
}

// ============================================
// Copy/Cut/Paste
// ============================================

export interface CopyPasteRequest {
  source: GridRange;
  destination: GridRange;
  pasteType?: PasteType;
  pasteOrientation?: "NORMAL" | "TRANSPOSE";
}

export interface CutPasteRequest {
  source: GridRange;
  destination: GridCoordinate;
  pasteType?: PasteType;
}

export type PasteType =
  | "PASTE_NORMAL"
  | "PASTE_VALUES"
  | "PASTE_FORMAT"
  | "PASTE_NO_BORDERS"
  | "PASTE_FORMULA"
  | "PASTE_DATA_VALIDATION"
  | "PASTE_CONDITIONAL_FORMATTING";

// ============================================
// Randomize Range
// ============================================

export interface RandomizeRangeRequest {
  range: GridRange;
}
