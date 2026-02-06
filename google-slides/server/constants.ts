/**
 * Google Slides API constants
 */

export const SLIDES_API_BASE = "https://slides.googleapis.com/v1/presentations";

export const ENDPOINTS = {
  PRESENTATIONS: SLIDES_API_BASE,
  PRESENTATION: (presentationId: string) =>
    `${SLIDES_API_BASE}/${presentationId}`,
  BATCH_UPDATE: (presentationId: string) =>
    `${SLIDES_API_BASE}/${presentationId}:batchUpdate`,
  PAGE: (presentationId: string, pageId: string) =>
    `${SLIDES_API_BASE}/${presentationId}/pages/${pageId}`,
};

export const PREDEFINED_LAYOUT = {
  BLANK: "BLANK",
  CAPTION_ONLY: "CAPTION_ONLY",
  TITLE: "TITLE",
  TITLE_AND_BODY: "TITLE_AND_BODY",
  TITLE_AND_TWO_COLUMNS: "TITLE_AND_TWO_COLUMNS",
  TITLE_ONLY: "TITLE_ONLY",
  SECTION_HEADER: "SECTION_HEADER",
  SECTION_TITLE_AND_DESCRIPTION: "SECTION_TITLE_AND_DESCRIPTION",
  ONE_COLUMN_TEXT: "ONE_COLUMN_TEXT",
  MAIN_POINT: "MAIN_POINT",
  BIG_NUMBER: "BIG_NUMBER",
} as const;

export const SHAPE_TYPE = {
  RECTANGLE: "RECTANGLE",
  ROUND_RECTANGLE: "ROUND_RECTANGLE",
  ELLIPSE: "ELLIPSE",
  TRIANGLE: "TRIANGLE",
  ARROW_NORTH: "ARROW_NORTH",
  ARROW_EAST: "ARROW_EAST",
  ARROW_SOUTH: "ARROW_SOUTH",
  ARROW_WEST: "ARROW_WEST",
  STAR_5: "STAR_5",
  HEART: "HEART",
  CLOUD: "CLOUD",
  SPEECH: "SPEECH",
  TEXT_BOX: "TEXT_BOX",
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  PRESENTATIONS: "https://www.googleapis.com/auth/presentations",
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;
