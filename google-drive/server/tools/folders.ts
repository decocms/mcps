/**
 * Folder Operations Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DriveClient, getAccessToken } from "../lib/drive-client.ts";
import { MIME_TYPES } from "../constants.ts";

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  parents: z.array(z.string()).optional(),
  createdTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  webViewLink: z.string().optional(),
});

export const createCreateFolderTool = (env: Env) =>
  createPrivateTool({
    id: "create_folder",
    description: "Create a new folder in Google Drive.",
    inputSchema: z.object({
      name: z.string().describe("Folder name"),
      parentId: z
        .string()
        .optional()
        .describe("Parent folder ID (root if not specified)"),
    }),
    outputSchema: z.object({
      folder: FileSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const folder = await client.createFolder(context.name, context.parentId);
      return { folder, success: true };
    },
  });

export const createListFolderContentsTool = (env: Env) =>
  createPrivateTool({
    id: "list_folder_contents",
    description: "List all files and folders inside a specific folder.",
    inputSchema: z.object({
      folderId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$|^root$/, "Invalid folder ID format")
        .describe("Folder ID (use 'root' for root folder)"),
      fileType: z
        .enum(["all", "folders", "files"])
        .optional()
        .describe("Filter by type"),
    }),
    outputSchema: z.object({
      files: z.array(FileSchema),
      folders: z.array(FileSchema),
      totalCount: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      // Escape single quotes in folderId to prevent query injection
      const safeFolderId = context.folderId.replace(/'/g, "\\'");
      let query = `'${safeFolderId}' in parents and trashed = false`;
      if (context.fileType === "folders") {
        query += ` and mimeType = '${MIME_TYPES.FOLDER}'`;
      } else if (context.fileType === "files") {
        query += ` and mimeType != '${MIME_TYPES.FOLDER}'`;
      }
      const result = await client.listFiles({ q: query, pageSize: 1000 });
      const items = result.files || [];
      const folders = items.filter((f) => f.mimeType === MIME_TYPES.FOLDER);
      const files = items.filter((f) => f.mimeType !== MIME_TYPES.FOLDER);
      return { files, folders, totalCount: items.length };
    },
  });

export const folderTools = [
  createCreateFolderTool,
  createListFolderContentsTool,
];
