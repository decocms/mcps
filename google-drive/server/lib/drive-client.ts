/**
 * Google Drive API client
 */

import { ENDPOINTS, DEFAULT_FIELDS, MIME_TYPES } from "../constants.ts";
import type { DriveFile, FileList, Permission } from "./types.ts";

export class DriveClient {
  private accessToken: string;

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drive API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // File operations
  async listFiles(
    params: {
      q?: string;
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
    } = {},
  ): Promise<FileList> {
    const url = new URL(ENDPOINTS.FILES);
    url.searchParams.set("fields", `nextPageToken,files(${DEFAULT_FIELDS})`);
    if (params.q) url.searchParams.set("q", params.q);
    if (params.pageSize)
      url.searchParams.set("pageSize", String(params.pageSize));
    if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);
    if (params.orderBy) url.searchParams.set("orderBy", params.orderBy);
    return this.request<FileList>(url.toString());
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const url = new URL(ENDPOINTS.FILE(fileId));
    url.searchParams.set("fields", DEFAULT_FIELDS);
    return this.request<DriveFile>(url.toString());
  }

  async createFile(metadata: {
    name: string;
    mimeType?: string;
    parents?: string[];
    description?: string;
  }): Promise<DriveFile> {
    const url = new URL(ENDPOINTS.FILES);
    url.searchParams.set("fields", DEFAULT_FIELDS);
    return this.request<DriveFile>(url.toString(), {
      method: "POST",
      body: JSON.stringify(metadata),
    });
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    return this.createFile({
      name,
      mimeType: MIME_TYPES.FOLDER,
      parents: parentId ? [parentId] : undefined,
    });
  }

  async updateFile(
    fileId: string,
    metadata: {
      name?: string;
      description?: string;
      starred?: boolean;
      trashed?: boolean;
    },
    addParents?: string[],
    removeParents?: string[],
  ): Promise<DriveFile> {
    const url = new URL(ENDPOINTS.FILE(fileId));
    url.searchParams.set("fields", DEFAULT_FIELDS);
    if (addParents?.length)
      url.searchParams.set("addParents", addParents.join(","));
    if (removeParents?.length)
      url.searchParams.set("removeParents", removeParents.join(","));
    return this.request<DriveFile>(url.toString(), {
      method: "PATCH",
      body: JSON.stringify(metadata),
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.FILE(fileId), { method: "DELETE" });
  }

  async copyFile(
    fileId: string,
    name?: string,
    parents?: string[],
  ): Promise<DriveFile> {
    const url = new URL(ENDPOINTS.FILE_COPY(fileId));
    url.searchParams.set("fields", DEFAULT_FIELDS);
    const body: any = {};
    if (name) body.name = name;
    if (parents) body.parents = parents;
    return this.request<DriveFile>(url.toString(), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async searchFiles(query: string, pageSize = 100): Promise<DriveFile[]> {
    const result = await this.listFiles({ q: query, pageSize });
    return result.files || [];
  }

  // Permission operations
  async listPermissions(fileId: string): Promise<Permission[]> {
    const url = new URL(ENDPOINTS.PERMISSIONS(fileId));
    url.searchParams.set(
      "fields",
      "permissions(id,type,role,emailAddress,domain,displayName)",
    );
    const result = await this.request<{ permissions: Permission[] }>(
      url.toString(),
    );
    return result.permissions || [];
  }

  async createPermission(
    fileId: string,
    permission: {
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
    },
    sendNotificationEmail = true,
    emailMessage?: string,
  ): Promise<Permission> {
    const url = new URL(ENDPOINTS.PERMISSIONS(fileId));
    url.searchParams.set(
      "sendNotificationEmail",
      String(sendNotificationEmail),
    );
    if (emailMessage) url.searchParams.set("emailMessage", emailMessage);
    return this.request<Permission>(url.toString(), {
      method: "POST",
      body: JSON.stringify(permission),
    });
  }

  async deletePermission(fileId: string, permissionId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.PERMISSION(fileId, permissionId), {
      method: "DELETE",
    });
  }

  // Export Google Docs formats
  async exportFile(fileId: string, mimeType: string): Promise<string> {
    const url = new URL(ENDPOINTS.FILE_EXPORT(fileId));
    url.searchParams.set("mimeType", mimeType);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drive export error: ${response.status} - ${error}`);
    }
    return response.text();
  }
}

export { getAccessToken } from "./env.ts";
