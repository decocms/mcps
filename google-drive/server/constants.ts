/**
 * Google Drive API constants
 */

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export const ENDPOINTS = {
  FILES: `${DRIVE_API_BASE}/files`,
  FILE: (fileId: string) => `${DRIVE_API_BASE}/files/${fileId}`,
  FILE_COPY: (fileId: string) => `${DRIVE_API_BASE}/files/${fileId}/copy`,
  FILE_EXPORT: (fileId: string) => `${DRIVE_API_BASE}/files/${fileId}/export`,
  PERMISSIONS: (fileId: string) =>
    `${DRIVE_API_BASE}/files/${fileId}/permissions`,
  PERMISSION: (fileId: string, permissionId: string) =>
    `${DRIVE_API_BASE}/files/${fileId}/permissions/${permissionId}`,
  UPLOAD: "https://www.googleapis.com/upload/drive/v3/files",
};

export const MIME_TYPES = {
  FOLDER: "application/vnd.google-apps.folder",
  DOCUMENT: "application/vnd.google-apps.document",
  SPREADSHEET: "application/vnd.google-apps.spreadsheet",
  PRESENTATION: "application/vnd.google-apps.presentation",
  FORM: "application/vnd.google-apps.form",
  DRAWING: "application/vnd.google-apps.drawing",
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export const DEFAULT_FIELDS =
  "id,name,mimeType,parents,createdTime,modifiedTime,size,webViewLink,webContentLink";

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  DRIVE: "https://www.googleapis.com/auth/drive",
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;
