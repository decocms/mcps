/**
 * Google Drive API types
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  owners?: User[];
  permissions?: Permission[];
}

export interface User {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
}

export interface Permission {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role:
    | "owner"
    | "organizer"
    | "fileOrganizer"
    | "writer"
    | "commenter"
    | "reader";
  emailAddress?: string;
  domain?: string;
  displayName?: string;
}

export interface FileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface CreateFileInput {
  name: string;
  mimeType?: string;
  parents?: string[];
  description?: string;
}

export interface UpdateFileInput {
  fileId: string;
  name?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  addParents?: string[];
  removeParents?: string[];
}

export interface ListFilesInput {
  q?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  fields?: string;
}

export interface CreatePermissionInput {
  fileId: string;
  type: "user" | "group" | "domain" | "anyone";
  role:
    | "owner"
    | "organizer"
    | "fileOrganizer"
    | "writer"
    | "commenter"
    | "reader";
  emailAddress?: string;
  domain?: string;
  sendNotificationEmail?: boolean;
  emailMessage?: string;
}
