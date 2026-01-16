/**
 * Google Slides API types
 */

export interface Presentation {
  presentationId: string;
  title: string;
  pageSize?: Size;
  slides?: Page[];
  masters?: Page[];
  layouts?: Page[];
  locale?: string;
  revisionId?: string;
}

export interface Page {
  objectId: string;
  pageType?: "SLIDE" | "MASTER" | "LAYOUT" | "NOTES" | "NOTES_MASTER";
  pageElements?: PageElement[];
  slideProperties?: SlideProperties;
  layoutProperties?: LayoutProperties;
  pageProperties?: PageProperties;
}

export interface PageElement {
  objectId: string;
  size?: Size;
  transform?: AffineTransform;
  title?: string;
  description?: string;
  shape?: Shape;
  image?: Image;
  table?: Table;
  line?: Line;
  video?: Video;
  wordArt?: WordArt;
  sheetsChart?: SheetsChart;
  elementGroup?: Group;
}

export interface Size {
  width?: Dimension;
  height?: Dimension;
}

export interface Dimension {
  magnitude: number;
  unit: "EMU" | "PT";
}

export interface AffineTransform {
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  translateX?: number;
  translateY?: number;
  unit?: "EMU" | "PT";
}

export interface Shape {
  shapeType?: string;
  text?: TextContent;
  shapeProperties?: ShapeProperties;
  placeholder?: Placeholder;
}

export interface TextContent {
  textElements?: TextElement[];
}

export interface TextElement {
  startIndex?: number;
  endIndex?: number;
  paragraphMarker?: ParagraphMarker;
  textRun?: TextRun;
  autoText?: AutoText;
}

export interface ParagraphMarker {
  style?: ParagraphStyle;
  bullet?: Bullet;
}

export interface ParagraphStyle {
  alignment?: "START" | "CENTER" | "END" | "JUSTIFIED";
  lineSpacing?: number;
  direction?: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  spacingMode?: string;
  spaceAbove?: Dimension;
  spaceBelow?: Dimension;
  indentFirstLine?: Dimension;
  indentStart?: Dimension;
  indentEnd?: Dimension;
}

export interface Bullet {
  listId: string;
  nestingLevel?: number;
  glyph?: string;
  bulletStyle?: TextStyle;
}

export interface TextRun {
  content?: string;
  style?: TextStyle;
}

export interface TextStyle {
  backgroundColor?: OptionalColor;
  foregroundColor?: OptionalColor;
  bold?: boolean;
  italic?: boolean;
  fontFamily?: string;
  fontSize?: Dimension;
  link?: Link;
  baselineOffset?: string;
  smallCaps?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  weightedFontFamily?: WeightedFontFamily;
}

export interface OptionalColor {
  opaqueColor?: OpaqueColor;
}

export interface OpaqueColor {
  rgbColor?: RgbColor;
  themeColor?: string;
}

export interface RgbColor {
  red?: number;
  green?: number;
  blue?: number;
}

export interface Link {
  url?: string;
  relativeLink?: string;
  pageObjectId?: string;
  slideIndex?: number;
}

export interface WeightedFontFamily {
  fontFamily?: string;
  weight?: number;
}

export interface AutoText {
  type?: string;
  content?: string;
  style?: TextStyle;
}

export interface ShapeProperties {
  shapeBackgroundFill?: ShapeBackgroundFill;
  outline?: Outline;
  shadow?: Shadow;
  link?: Link;
  contentAlignment?: string;
}

export interface ShapeBackgroundFill {
  propertyState?: string;
  solidFill?: SolidFill;
}

export interface SolidFill {
  color?: OpaqueColor;
  alpha?: number;
}

export interface Outline {
  outlineFill?: OutlineFill;
  weight?: Dimension;
  dashStyle?: string;
  propertyState?: string;
}

export interface OutlineFill {
  solidFill?: SolidFill;
}

export interface Shadow {
  type?: string;
  transform?: AffineTransform;
  alignment?: string;
  blurRadius?: Dimension;
  color?: OpaqueColor;
  alpha?: number;
  rotateWithShape?: boolean;
  propertyState?: string;
}

export interface Placeholder {
  type?: string;
  index?: number;
  parentObjectId?: string;
}

export interface Image {
  contentUrl?: string;
  imageProperties?: ImageProperties;
  sourceUrl?: string;
  placeholder?: Placeholder;
}

export interface ImageProperties {
  cropProperties?: CropProperties;
  transparency?: number;
  brightness?: number;
  contrast?: number;
  recolor?: Recolor;
  outline?: Outline;
  shadow?: Shadow;
  link?: Link;
}

export interface CropProperties {
  leftOffset?: number;
  rightOffset?: number;
  topOffset?: number;
  bottomOffset?: number;
  angle?: number;
}

export interface Recolor {
  recolorStops?: ColorStop[];
  name?: string;
}

export interface ColorStop {
  color?: OpaqueColor;
  alpha?: number;
  position?: number;
}

export interface Table {
  rows: number;
  columns: number;
  tableRows?: TableRow[];
  tableColumns?: TableColumnProperties[];
  horizontalBorderRows?: TableBorderRow[];
  verticalBorderRows?: TableBorderRow[];
}

export interface TableRow {
  rowHeight?: Dimension;
  tableCells?: TableCell[];
  tableRowProperties?: TableRowProperties;
}

export interface TableCell {
  location?: TableCellLocation;
  rowSpan?: number;
  columnSpan?: number;
  text?: TextContent;
  tableCellProperties?: TableCellProperties;
}

export interface TableCellLocation {
  rowIndex?: number;
  columnIndex?: number;
}

export interface TableCellProperties {
  tableCellBackgroundFill?: TableCellBackgroundFill;
  contentAlignment?: string;
}

export interface TableCellBackgroundFill {
  propertyState?: string;
  solidFill?: SolidFill;
}

export interface TableColumnProperties {
  columnWidth?: Dimension;
}

export interface TableBorderRow {
  tableBorderCells?: TableBorderCell[];
}

export interface TableBorderCell {
  location?: TableCellLocation;
  tableBorderProperties?: TableBorderProperties;
}

export interface TableBorderProperties {
  tableBorderFill?: TableBorderFill;
  weight?: Dimension;
  dashStyle?: string;
}

export interface TableBorderFill {
  solidFill?: SolidFill;
}

export interface TableRowProperties {
  minRowHeight?: Dimension;
}

export interface Line {
  lineProperties?: LineProperties;
  lineType?: string;
  lineCategory?: string;
}

export interface LineProperties {
  lineFill?: LineFill;
  weight?: Dimension;
  dashStyle?: string;
  startArrow?: string;
  endArrow?: string;
  link?: Link;
  startConnection?: LineConnection;
  endConnection?: LineConnection;
}

export interface LineFill {
  solidFill?: SolidFill;
}

export interface LineConnection {
  connectedObjectId?: string;
  connectionSiteIndex?: number;
}

export interface Video {
  url?: string;
  source?: string;
  id?: string;
  videoProperties?: VideoProperties;
}

export interface VideoProperties {
  outline?: Outline;
  autoPlay?: boolean;
  start?: number;
  end?: number;
  mute?: boolean;
}

export interface WordArt {
  renderedText?: string;
}

export interface SheetsChart {
  spreadsheetId?: string;
  chartId?: number;
  contentUrl?: string;
  sheetsChartProperties?: SheetsChartProperties;
}

export interface SheetsChartProperties {
  chartImageProperties?: ImageProperties;
}

export interface Group {
  children?: PageElement[];
}

export interface SlideProperties {
  layoutObjectId?: string;
  masterObjectId?: string;
  notesPage?: Page;
  isSkipped?: boolean;
}

export interface LayoutProperties {
  masterObjectId?: string;
  name?: string;
  displayName?: string;
}

export interface PageProperties {
  pageBackgroundFill?: PageBackgroundFill;
  colorScheme?: ColorScheme;
}

export interface PageBackgroundFill {
  propertyState?: string;
  solidFill?: SolidFill;
  stretchedPictureFill?: StretchedPictureFill;
}

export interface StretchedPictureFill {
  contentUrl?: string;
  size?: Size;
}

export interface ColorScheme {
  colors?: ThemeColorPair[];
}

export interface ThemeColorPair {
  type?: string;
  color?: RgbColor;
}

export interface Request {
  createSlide?: CreateSlideRequest;
  createShape?: CreateShapeRequest;
  createTable?: CreateTableRequest;
  createImage?: CreateImageRequest;
  insertText?: InsertTextRequest;
  deleteObject?: DeleteObjectRequest;
  updateShapeProperties?: UpdateShapePropertiesRequest;
  replaceAllText?: ReplaceAllTextRequest;
  duplicateObject?: DuplicateObjectRequest;
  updateSlidesPosition?: UpdateSlidesPositionRequest;
  deleteText?: DeleteTextRequest;
  updateTextStyle?: UpdateTextStyleRequest;
  updatePageProperties?: UpdatePagePropertiesRequest;
}

export interface CreateSlideRequest {
  objectId?: string;
  insertionIndex?: number;
  slideLayoutReference?: LayoutReference;
  placeholderIdMappings?: LayoutPlaceholderIdMapping[];
}

export interface LayoutReference {
  predefinedLayout?: string;
  layoutId?: string;
}

export interface LayoutPlaceholderIdMapping {
  layoutPlaceholder?: Placeholder;
  objectId?: string;
}

export interface CreateShapeRequest {
  objectId?: string;
  elementProperties: PageElementProperties;
  shapeType: string;
}

export interface PageElementProperties {
  pageObjectId: string;
  size?: Size;
  transform?: AffineTransform;
}

export interface CreateTableRequest {
  objectId?: string;
  elementProperties: PageElementProperties;
  rows: number;
  columns: number;
}

export interface CreateImageRequest {
  objectId?: string;
  elementProperties: PageElementProperties;
  url: string;
}

export interface InsertTextRequest {
  objectId: string;
  insertionIndex?: number;
  text: string;
}

export interface DeleteObjectRequest {
  objectId: string;
}

export interface UpdateShapePropertiesRequest {
  objectId: string;
  shapeProperties: ShapeProperties;
  fields: string;
}

export interface ReplaceAllTextRequest {
  containsText: SubstringMatchCriteria;
  replaceText: string;
  pageObjectIds?: string[];
}

export interface SubstringMatchCriteria {
  text: string;
  matchCase?: boolean;
}

export interface DuplicateObjectRequest {
  objectId: string;
  objectIds?: Record<string, string>;
}

export interface UpdateSlidesPositionRequest {
  slideObjectIds: string[];
  insertionIndex: number;
}

export interface DeleteTextRequest {
  objectId: string;
  textRange: Range;
}

export interface Range {
  startIndex?: number;
  endIndex?: number;
  type?: "FIXED_RANGE" | "FROM_START_INDEX" | "ALL";
}

export interface UpdateTextStyleRequest {
  objectId: string;
  textRange?: Range;
  style: TextStyle;
  fields: string;
}

export interface UpdatePagePropertiesRequest {
  objectId: string;
  pageProperties: PageProperties;
  fields: string;
}

export interface BatchUpdateResponse {
  presentationId: string;
  replies: any[];
  writeControl?: WriteControl;
}

export interface WriteControl {
  requiredRevisionId?: string;
}
