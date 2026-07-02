/**
 * Google Docs API constants
 */

export const DOCS_API_BASE = "https://docs.googleapis.com/v1/documents";

export const DRIVE_API_FILES = "https://www.googleapis.com/drive/v3/files";

export const DOCUMENT_MIME_TYPE = "application/vnd.google-apps.document";

export const ENDPOINTS = {
  DOCUMENTS: DOCS_API_BASE,
  DOCUMENT: (documentId: string) => `${DOCS_API_BASE}/${documentId}`,
  BATCH_UPDATE: (documentId: string) =>
    `${DOCS_API_BASE}/${documentId}:batchUpdate`,
  DRIVE_FILES: DRIVE_API_FILES,
};

export const NAMED_STYLE_TYPE = {
  NORMAL_TEXT: "NORMAL_TEXT",
  TITLE: "TITLE",
  SUBTITLE: "SUBTITLE",
  HEADING_1: "HEADING_1",
  HEADING_2: "HEADING_2",
  HEADING_3: "HEADING_3",
  HEADING_4: "HEADING_4",
  HEADING_5: "HEADING_5",
  HEADING_6: "HEADING_6",
} as const;

export const BULLET_GLYPH_PRESET = {
  BULLET_DISC_CIRCLE_SQUARE: "BULLET_DISC_CIRCLE_SQUARE",
  BULLET_DIAMONDX_ARROW3D_SQUARE: "BULLET_DIAMONDX_ARROW3D_SQUARE",
  BULLET_CHECKBOX: "BULLET_CHECKBOX",
  BULLET_ARROW_DIAMOND_DISC: "BULLET_ARROW_DIAMOND_DISC",
  BULLET_STAR_CIRCLE_SQUARE: "BULLET_STAR_CIRCLE_SQUARE",
  BULLET_ARROW3D_CIRCLE_SQUARE: "BULLET_ARROW3D_CIRCLE_SQUARE",
  NUMBERED_DECIMAL_ALPHA_ROMAN: "NUMBERED_DECIMAL_ALPHA_ROMAN",
  NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS: "NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS",
  NUMBERED_DECIMAL_NESTED: "NUMBERED_DECIMAL_NESTED",
  NUMBERED_UPPERALPHA_ALPHA_ROMAN: "NUMBERED_UPPERALPHA_ALPHA_ROMAN",
  NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL:
    "NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL",
  NUMBERED_ZERODECIMAL_ALPHA_ROMAN: "NUMBERED_ZERODECIMAL_ALPHA_ROMAN",
} as const;

// Google OAuth scopes
// drive.file is non-sensitive (no Google verification review needed) and
// covers Docs API create/read/edit plus Drive listing — but only for files
// created or opened through this app.
export const GOOGLE_SCOPES = {
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;
