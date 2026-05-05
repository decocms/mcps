/**
 * Google Workspace MCP — bundled OAuth scopes.
 *
 * The Workspace MCP composes tool factories from our existing Google REST-based
 * MCPs (google-calendar, google-gmail, google-drive, google-docs, google-sheets,
 * google-slides, google-forms, google-meet). Each child MCP advertises its own
 * scope set; this file is the **union** of those, deduped, sent to Google's
 * authorization endpoint as a single consent screen.
 *
 * Keep narrow: only the broadest scope per service is needed because Google's
 * scope hierarchy means `calendar` covers `calendar.events`/`calendar.readonly`,
 * `drive` covers `drive.file`/`drive.readonly`, etc. Sub-scopes are listed only
 * when they aren't implied by a broader scope already on the list.
 */

export const GOOGLE_WORKSPACE_SCOPES: string[] = [
  // Calendar
  "https://www.googleapis.com/auth/calendar",
  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  // Drive (full read/write — also satisfies the .file scope used by Docs/Sheets/Slides/Forms)
  "https://www.googleapis.com/auth/drive",
  // Docs
  "https://www.googleapis.com/auth/documents",
  // Sheets
  "https://www.googleapis.com/auth/spreadsheets",
  // Slides
  "https://www.googleapis.com/auth/presentations",
  // Forms
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  // Meet
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];

/**
 * Tool prefix → human label, used to namespace tool ids and produce TOOLS.md.
 */
export const SERVICE_PREFIXES = {
  calendar: "Calendar",
  gmail: "Gmail",
  drive: "Drive",
  docs: "Docs",
  sheets: "Sheets",
  slides: "Slides",
  forms: "Forms",
  meet: "Meet",
} as const;

export type ServicePrefix = keyof typeof SERVICE_PREFIXES;
