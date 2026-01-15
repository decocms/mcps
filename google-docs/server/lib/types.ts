/**
 * Google Docs API types
 */

export interface Document {
  documentId: string;
  title: string;
  body?: Body;
  revisionId?: string;
  documentStyle?: DocumentStyle;
}

export interface Body {
  content?: StructuralElement[];
}

export interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: Paragraph;
  table?: Table;
  sectionBreak?: SectionBreak;
  tableOfContents?: TableOfContents;
}

export interface Paragraph {
  elements?: ParagraphElement[];
  paragraphStyle?: ParagraphStyle;
  bullet?: Bullet;
}

export interface ParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: TextRun;
  inlineObjectElement?: InlineObjectElement;
}

export interface TextRun {
  content?: string;
  textStyle?: TextStyle;
}

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: Dimension;
  foregroundColor?: OptionalColor;
  backgroundColor?: OptionalColor;
  link?: Link;
}

export interface Dimension {
  magnitude: number;
  unit: "PT" | "UNIT_UNSPECIFIED";
}

export interface OptionalColor {
  color?: Color;
}

export interface Color {
  rgbColor?: RgbColor;
}

export interface RgbColor {
  red?: number;
  green?: number;
  blue?: number;
}

export interface Link {
  url?: string;
  bookmarkId?: string;
  headingId?: string;
}

export interface ParagraphStyle {
  namedStyleType?: string;
  alignment?: "START" | "CENTER" | "END" | "JUSTIFIED";
  lineSpacing?: number;
  direction?: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  spacingMode?:
    | "SPACING_MODE_UNSPECIFIED"
    | "NEVER_COLLAPSE"
    | "COLLAPSE_LISTS";
  spaceAbove?: Dimension;
  spaceBelow?: Dimension;
  indentFirstLine?: Dimension;
  indentStart?: Dimension;
  indentEnd?: Dimension;
}

export interface Bullet {
  listId: string;
  nestingLevel?: number;
}

export interface Table {
  rows: number;
  columns: number;
  tableRows?: TableRow[];
}

export interface TableRow {
  startIndex?: number;
  endIndex?: number;
  tableCells?: TableCell[];
}

export interface TableCell {
  startIndex?: number;
  endIndex?: number;
  content?: StructuralElement[];
}

export interface SectionBreak {
  sectionStyle?: SectionStyle;
}

export interface SectionStyle {
  columnSeparatorStyle?: string;
  contentDirection?: string;
}

export interface TableOfContents {
  content?: StructuralElement[];
}

export interface InlineObjectElement {
  inlineObjectId?: string;
}

export interface DocumentStyle {
  background?: Background;
  defaultHeaderId?: string;
  defaultFooterId?: string;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  marginLeft?: Dimension;
  marginRight?: Dimension;
  pageSize?: Size;
}

export interface Background {
  color?: OptionalColor;
}

export interface Size {
  height?: Dimension;
  width?: Dimension;
}

export interface Request {
  insertText?: InsertTextRequest;
  deleteContentRange?: DeleteContentRangeRequest;
  updateTextStyle?: UpdateTextStyleRequest;
  updateParagraphStyle?: UpdateParagraphStyleRequest;
  createParagraphBullets?: CreateParagraphBulletsRequest;
  deleteParagraphBullets?: DeleteParagraphBulletsRequest;
  insertTable?: InsertTableRequest;
  insertInlineImage?: InsertInlineImageRequest;
  insertPageBreak?: InsertPageBreakRequest;
  replaceAllText?: ReplaceAllTextRequest;
}

export interface InsertTextRequest {
  text: string;
  location: Location;
}

export interface Location {
  index: number;
  segmentId?: string;
}

export interface DeleteContentRangeRequest {
  range: Range;
}

export interface Range {
  startIndex: number;
  endIndex: number;
  segmentId?: string;
}

export interface UpdateTextStyleRequest {
  textStyle: TextStyle;
  range: Range;
  fields: string;
}

export interface UpdateParagraphStyleRequest {
  paragraphStyle: ParagraphStyle;
  range: Range;
  fields: string;
}

export interface CreateParagraphBulletsRequest {
  range: Range;
  bulletPreset: string;
}

export interface DeleteParagraphBulletsRequest {
  range: Range;
}

export interface InsertTableRequest {
  rows: number;
  columns: number;
  location: Location;
}

export interface InsertInlineImageRequest {
  uri: string;
  location: Location;
  objectSize?: Size;
}

export interface InsertPageBreakRequest {
  location: Location;
}

export interface ReplaceAllTextRequest {
  containsText: SubstringMatchCriteria;
  replaceText: string;
}

export interface SubstringMatchCriteria {
  text: string;
  matchCase?: boolean;
}

export interface BatchUpdateResponse {
  documentId: string;
  replies: any[];
  writeControl?: WriteControl;
}

export interface WriteControl {
  requiredRevisionId?: string;
}
